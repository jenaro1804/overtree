import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { readFile, writeFile } from "@/lib/core/files";
import { projectCacheDir, resolveInProject } from "@/lib/core/storage";
import { createHash } from "node:crypto";
import type { WebSocket } from "ws";

const FLUSH_DEBOUNCE_MS = 800;
const STATE_FLUSH_DEBOUNCE_MS = 300;
const IDLE_DISPOSE_MS = 5 * 60 * 1000;

/**
 * Persisted binary Y.Doc state file path. Lives in the per-machine cache (NOT
 * the project dir) so the ~300ms write churn never reaches OneDrive. It lets
 * `getRoom()` rehydrate the FULL CRDT history across server restarts so
 * reconnecting clients merge cleanly instead of producing duplicate content;
 * when the cache is empty (other machine / cleared) getRoom reseeds from the
 * on-disk text — only cross-session undo history is lost, not content.
 */
async function yjsStateFile(
  projectId: string,
  filePath: string,
): Promise<string> {
  const cacheDir = projectCacheDir(projectId);
  const safe = Buffer.from(filePath, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return path.join(cacheDir, "yjs", `${safe}.bin`);
}

export type Room = {
  key: string;
  projectId: string;
  filePath: string;
  doc: Y.Doc;
  ytext: Y.Text;
  awareness: Awareness;
  connections: Set<WebSocket>;
  lastDiskHash: string;
  pendingFlushHash: string | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  stateFlushTimer: ReturnType<typeof setTimeout> | null;
  watcher: FSWatcher | null;
  disposeTimer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();

function roomKey(projectId: string, filePath: string): string {
  return `${projectId}::${filePath}`;
}

function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

export async function getRoom(
  projectId: string,
  filePath: string,
): Promise<Room> {
  const key = roomKey(projectId, filePath);
  const existing = rooms.get(key);
  if (existing) {
    if (existing.disposeTimer) {
      clearTimeout(existing.disposeTimer);
      existing.disposeTimer = null;
    }
    return existing;
  }

  const doc = new Y.Doc();
  const ytext = doc.getText("content");

  // Prefer the persisted Y.Doc binary state — it preserves CRDT history so
  // reconnecting clients merge idempotently across server restarts.
  // Fall back to seeding from the on-disk text only when no state exists yet.
  const stateFile = await yjsStateFile(projectId, filePath);
  let seededFromState = false;
  try {
    const persisted = await fs.readFile(stateFile);
    Y.applyUpdate(doc, new Uint8Array(persisted), "disk-sync");
    seededFromState = true;
  } catch {
    /* no persisted state yet */
  }
  const diskContent = await readFile(projectId, filePath).catch(() => "");
  if (!seededFromState) {
    if (diskContent) {
      doc.transact(() => ytext.insert(0, diskContent), "disk-sync");
    }
  } else if (ytext.toString() !== diskContent && diskContent) {
    // External tool edited the file while server was off — reflect into Y.Text.
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, diskContent);
    }, "disk-sync");
  }

  const awareness = new Awareness(doc);
  const room: Room = {
    key,
    projectId,
    filePath,
    doc,
    ytext,
    awareness,
    connections: new Set(),
    lastDiskHash: hashContent(ytext.toString()),
    pendingFlushHash: null,
    flushTimer: null,
    stateFlushTimer: null,
    watcher: null,
    disposeTimer: null,
  };

  doc.on("update", (_update, origin) => {
    scheduleStateFlush(room);
    if (origin === "disk-sync") return;
    scheduleFlush(room);
  });

  // Watch the on-disk file for external edits (e.g. MCP writes, other tools)
  const abs = await resolveInProject(projectId, filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const watcher = chokidar.watch(abs, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });
  watcher.on("change", () => onDiskChange(room).catch(() => {}));
  watcher.on("add", () => onDiskChange(room).catch(() => {}));
  room.watcher = watcher;

  rooms.set(key, room);
  return room;
}

function scheduleFlush(room: Room) {
  if (room.flushTimer) clearTimeout(room.flushTimer);
  room.flushTimer = setTimeout(() => flushToDisk(room), FLUSH_DEBOUNCE_MS);
}

function scheduleStateFlush(room: Room) {
  if (room.stateFlushTimer) clearTimeout(room.stateFlushTimer);
  room.stateFlushTimer = setTimeout(
    () => flushYjsState(room),
    STATE_FLUSH_DEBOUNCE_MS,
  );
}

async function flushYjsState(room: Room) {
  room.stateFlushTimer = null;
  try {
    const file = await yjsStateFile(room.projectId, room.filePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const update = Y.encodeStateAsUpdate(room.doc);
    await fs.writeFile(file, update);
  } catch (err) {
    console.error("yjs state flush failed", room.key, err);
  }
}

async function flushToDisk(room: Room) {
  room.flushTimer = null;
  const content = room.ytext.toString();
  const hash = hashContent(content);
  if (hash === room.lastDiskHash) return;
  room.pendingFlushHash = hash;
  try {
    await writeFile(room.projectId, room.filePath, content);
    room.lastDiskHash = hash;
  } catch (err) {
    console.error("flush failed", room.key, err);
  } finally {
    room.pendingFlushHash = null;
  }
}

async function onDiskChange(room: Room) {
  let content: string;
  try {
    content = await readFile(room.projectId, room.filePath);
  } catch {
    return;
  }
  const hash = hashContent(content);
  if (hash === room.lastDiskHash) return; // self-write
  if (hash === room.pendingFlushHash) return; // mid-flush echo
  room.lastDiskHash = hash;
  // Replace whole Y.Text with disk content. origin "disk-sync" prevents loop.
  room.doc.transact(() => {
    room.ytext.delete(0, room.ytext.length);
    room.ytext.insert(0, content);
  }, "disk-sync");
}

export function attachConnection(room: Room, ws: WebSocket) {
  room.connections.add(ws);
  if (room.disposeTimer) {
    clearTimeout(room.disposeTimer);
    room.disposeTimer = null;
  }
}

export function detachConnection(room: Room, ws: WebSocket) {
  room.connections.delete(ws);
  if (room.connections.size === 0) {
    room.disposeTimer = setTimeout(() => disposeRoom(room), IDLE_DISPOSE_MS);
  }
}

async function disposeRoom(room: Room) {
  if (room.connections.size > 0) return;
  if (room.flushTimer) {
    clearTimeout(room.flushTimer);
    await flushToDisk(room);
  }
  if (room.stateFlushTimer) {
    clearTimeout(room.stateFlushTimer);
    await flushYjsState(room);
  }
  if (room.watcher) {
    await room.watcher.close().catch(() => {});
  }
  room.doc.destroy();
  rooms.delete(room.key);
}

/** Flush all in-memory Y.Docs belonging to a project to disk, awaiting writes. */
export async function flushProjectDocs(projectId: string): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const room of rooms.values()) {
    if (room.projectId !== projectId) continue;
    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
      room.flushTimer = null;
    }
    tasks.push(flushToDisk(room));
  }
  await Promise.all(tasks);
}

/** Apply external (e.g. MCP HTTP) write so connected editors see the change. */
export async function applyExternalUpdate(
  projectId: string,
  filePath: string,
  newContent: string,
): Promise<void> {
  const key = roomKey(projectId, filePath);
  const room = rooms.get(key);
  if (!room) return;
  const hash = hashContent(newContent);
  if (hash === room.lastDiskHash) return;
  room.lastDiskHash = hash;
  room.doc.transact(() => {
    room.ytext.delete(0, room.ytext.length);
    room.ytext.insert(0, newContent);
  }, "disk-sync");
}
