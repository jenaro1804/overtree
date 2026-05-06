import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { readFile, writeFile } from "@/lib/core/files";
import { resolveInProject } from "@/lib/core/storage";
import { createHash } from "node:crypto";
import type { WebSocket } from "ws";

const FLUSH_DEBOUNCE_MS = 800;
const IDLE_DISPOSE_MS = 5 * 60 * 1000;

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
  const initial = await readFile(projectId, filePath).catch(() => "");
  const doc = new Y.Doc();
  const ytext = doc.getText("content");
  ytext.insert(0, initial);
  const awareness = new Awareness(doc);
  const room: Room = {
    key,
    projectId,
    filePath,
    doc,
    ytext,
    awareness,
    connections: new Set(),
    lastDiskHash: hashContent(initial),
    pendingFlushHash: null,
    flushTimer: null,
    watcher: null,
    disposeTimer: null,
  };

  doc.on("update", (_update, origin) => {
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
  if (room.watcher) {
    await room.watcher.close().catch(() => {});
  }
  room.doc.destroy();
  rooms.delete(room.key);
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
