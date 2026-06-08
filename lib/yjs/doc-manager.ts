import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { readFile, writeFile } from "@/lib/core/files";
import { projectCacheDir, resolveInProject } from "@/lib/core/storage";
import { createHash } from "node:crypto";
import type { WebSocket } from "ws";
import { registerDocManager } from "./doc-manager-bridge";

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

// Pin the rooms map on globalThis so it survives this module being loaded twice
// in one process: once by the tsx-run custom server (server.ts dynamic-imports
// lib/yjs/ws-server, which Node resolves straight from source) and once inside
// the Next webpack bundle (the API routes + MCP import doc-manager). Without the
// pin those are two distinct module instances → two separate `rooms` maps: the
// live editor doc lives in the WS-side map while /api/save, MCP applyExternalUpdate
// and closeProjectRooms run against the other (empty) one. One shared map fixes it.
const globalForRooms = globalThis as unknown as {
  __overtreeRooms?: Map<string, Room>;
};
const rooms: Map<string, Room> = (globalForRooms.__overtreeRooms ??= new Map<
  string,
  Room
>());

function roomKey(projectId: string, filePath: string): string {
  return `${projectId}::${filePath}`;
}

/** Normalize CRLF→LF so OneDrive rewriting our own file with different line
 * endings is recognized as a self-write (same hash) instead of looking like an
 * external edit. The CRDT always stores LF; disk reads are normalized before
 * hashing/seeding. */
function normalizeEol(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

/**
 * Reconcile a Y.Text toward `next` with a MINIMAL diff (shared common prefix +
 * suffix; replace only the differing middle). This replaces the old destructive
 * `delete(0, len) + insert(0, next)` reseed, which minted a brand-new full-document
 * lineage on every disk sync — when that raced a peer's concurrent insertions at
 * the same positions, Yjs interleaved the two lineages character-by-character
 * (the "gibberish" corruption). A minimal diff touches only changed ranges, so
 * unchanged text keeps its identity and cursors/positions survive.
 */
function replaceText(ytext: Y.Text, next: string, origin: unknown): void {
  const cur = ytext.toString();
  if (cur === next) return;
  let start = 0;
  const minLen = Math.min(cur.length, next.length);
  while (start < minLen && cur.charCodeAt(start) === next.charCodeAt(start)) {
    start++;
  }
  let endCur = cur.length;
  let endNext = next.length;
  while (
    endCur > start &&
    endNext > start &&
    cur.charCodeAt(endCur - 1) === next.charCodeAt(endNext - 1)
  ) {
    endCur--;
    endNext--;
  }
  const delCount = endCur - start;
  const insStr = next.slice(start, endNext);
  const apply = () => {
    if (delCount > 0) ytext.delete(start, delCount);
    if (insStr) ytext.insert(start, insStr);
  };
  const doc = ytext.doc;
  if (doc) doc.transact(apply, origin);
  else apply();
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
    // Reconnecting to an idle room (e.g. a page reload, or reopening within the
    // 5-min idle window). While a client was connected, onDiskChange deliberately
    // skipped external on-disk edits (MCP/Codex/other tools) so they couldn't
    // interleave with live typing. Now that nobody is connected, pull those edits
    // from disk so the user sees them on reload — matching the "reload to fetch
    // external changes" workflow — without ever merging into a live session.
    if (existing.connections.size === 0) {
      await reconcileFromDisk(existing);
    }
    return existing;
  }

  const doc = new Y.Doc();
  const ytext = doc.getText("content");

  // Load the persisted Y.Doc binary state if present — it preserves CRDT history
  // so undo survives a server restart when disk and CRDT still agree.
  const stateFile = await yjsStateFile(projectId, filePath);
  try {
    const persisted = await fs.readFile(stateFile);
    Y.applyUpdate(doc, new Uint8Array(persisted), "disk-sync");
  } catch {
    /* no persisted state yet */
  }

  // Path A — DISK (.tex) IS THE AUTHORITY. If the persisted CRDT disagrees with
  // the on-disk text (OneDrive synced a newer .tex from this/another machine, or
  // an external tool edited it while the server was off), the disk wins. Reconcile
  // with a minimal diff, NOT a destructive full reseed. This is safe regardless of
  // history: no client is attached yet (attachConnection happens after getRoom),
  // so there is no concurrent editor to interleave with → no gibberish. The stale
  // local .bin never gets to fight the OneDrive-synced source.
  const diskContent = normalizeEol(
    await readFile(projectId, filePath).catch(() => ""),
  );
  if (normalizeEol(ytext.toString()) !== diskContent) {
    replaceText(ytext, diskContent, "disk-sync");
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
  let raw: string;
  try {
    raw = await readFile(room.projectId, room.filePath);
  } catch {
    return;
  }
  const content = normalizeEol(raw);
  const hash = hashContent(content);
  if (hash === room.lastDiskHash) return; // self-write echo (EOL-normalized)
  if (hash === room.pendingFlushHash) return; // mid-flush echo
  // Path A: while a client is connected the live CRDT is the authority. Do NOT
  // merge a background disk rewrite into a doc the user is actively editing —
  // that concurrent two-lineage merge is exactly what produced the interleaved
  // gibberish (OneDrive re-touching the .tex acted as an invisible second editor).
  // The live content flushes back to disk, overwriting the external change; any
  // genuine external edit is reconciled on the next reopen (getRoom reseeds from
  // disk). Only when no client is attached is it safe to adopt the new disk text.
  if (room.connections.size > 0) return;
  room.lastDiskHash = hash;
  replaceText(room.ytext, content, "disk-sync");
}

/**
 * Pull external on-disk edits into an idle room. Called from getRoom when a client
 * reconnects to a room that has no active connections (a reload / reopen). This is
 * the counterpart to onDiskChange's "skip while connected" guard: external edits
 * (MCP/Codex/other tools) are not merged into a live session, but ARE adopted the
 * moment the user reloads. Safe because no client is attached → no concurrent
 * editor to interleave with.
 */
async function reconcileFromDisk(room: Room): Promise<void> {
  // Never clobber local edits that haven't been flushed to disk yet: a pending
  // flush means the CRDT is AHEAD of disk, so disk is not the newer version.
  if (room.flushTimer) return;
  let raw: string;
  try {
    raw = await readFile(room.projectId, room.filePath);
  } catch {
    return;
  }
  const content = normalizeEol(raw);
  const hash = hashContent(content);
  if (hash === room.lastDiskHash) return; // disk unchanged since our last write
  room.lastDiskHash = hash;
  if (normalizeEol(room.ytext.toString()) === content) return; // already in sync
  replaceText(room.ytext, content, "disk-sync");
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

/**
 * Flush and fully tear down ALL rooms of a project — even ones with active
 * connections. Releases the chokidar watcher handle (the typical Windows/OneDrive
 * lock culprit) so the project folder can be renamed/moved/removed. Connected
 * clients will reconnect to a fresh room (reseeded from disk) on next activity.
 */
export async function closeProjectRooms(projectId: string): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const room of [...rooms.values()]) {
    if (room.projectId !== projectId) continue;
    if (room.disposeTimer) {
      clearTimeout(room.disposeTimer);
      room.disposeTimer = null;
    }
    tasks.push(forceCloseRoom(room));
  }
  await Promise.all(tasks);
}

async function forceCloseRoom(room: Room): Promise<void> {
  if (room.flushTimer) {
    clearTimeout(room.flushTimer);
    room.flushTimer = null;
    await flushToDisk(room);
  }
  if (room.stateFlushTimer) {
    clearTimeout(room.stateFlushTimer);
    room.stateFlushTimer = null;
    await flushYjsState(room);
  }
  if (room.watcher) {
    await room.watcher.close().catch(() => {});
    room.watcher = null;
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
  const content = normalizeEol(newContent);
  const hash = hashContent(content);
  if (hash === room.lastDiskHash) return;
  room.lastDiskHash = hash;
  // Minimal diff (not full delete+insert): an MCP write while the editor is open
  // is genuinely concurrent with the user's typing, so touch only changed ranges.
  replaceText(room.ytext, content, "disk-sync");
}

// This module is the ONLY place yjs is loaded server-side. Publish the public API
// to the globalThis bridge so the webpack-bundled routes can reach this single
// instance without importing yjs into their module graph (see doc-manager-bridge).
registerDocManager({ flushProjectDocs, applyExternalUpdate, closeProjectRooms });
