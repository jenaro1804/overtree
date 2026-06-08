// Cross-module-graph bridge to the doc-manager.
//
// In the dev-server process there are TWO module graphs: the tsx-run custom
// server (server.ts → ws-server → doc-manager) and the Next webpack bundle (the
// API routes). If both graphs import doc-manager, yjs loads twice in one process
// (ESM `yjs.mjs` on the tsx side, CJS `yjs.cjs` on the webpack side) → the "Yjs
// was already imported … breaks constructor checks" warning (yjs#438) AND real
// cross-copy breakage (e.g. closeProjectRooms calling `Y.encodeStateAsUpdate` on
// a Doc created by the other copy).
//
// Fix: only the WS side (tsx) ever imports doc-manager — and therefore yjs. It
// self-registers its public API here at load. The webpack-bundled routes import
// THIS module instead (no yjs; the `import type` below is erased at compile) and
// call through the globalThis-pinned reference. One yjs instance, one rooms map.
import type {
  applyExternalUpdate,
  flushProjectDocs,
  closeProjectRooms,
} from "./doc-manager";

export type DocManagerApi = {
  flushProjectDocs: typeof flushProjectDocs;
  applyExternalUpdate: typeof applyExternalUpdate;
  closeProjectRooms: typeof closeProjectRooms;
};

const g = globalThis as unknown as { __overtreeDocManager?: DocManagerApi };

export function registerDocManager(api: DocManagerApi): void {
  g.__overtreeDocManager = api;
}

// When no doc-manager is registered in this process — e.g. the standalone MCP
// stdio process, which has no WS server and thus no in-memory rooms — these are
// the CORRECT no-ops: there is no live CRDT here to flush/update/close. The
// on-disk file write still reaches live editors via the dev server's file
// watcher (onDiskChange / reconcileFromDisk on reopen).
const NOOP: DocManagerApi = {
  flushProjectDocs: async () => {},
  applyExternalUpdate: async () => {},
  closeProjectRooms: async () => {},
};

export function docManager(): DocManagerApi {
  return g.__overtreeDocManager ?? NOOP;
}
