import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import {
  attachConnection,
  detachConnection,
  getRoom,
  type Room,
} from "./doc-manager";
import {
  hasProjectAccess,
  readSessionFromCookieHeader,
  type Session,
} from "@/lib/core/auth";
import { readMeta } from "@/lib/core/projects";

const messageSync = 0;
const messageAwareness = 1;

function safeSend(ws: WebSocket, data: Uint8Array) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(data);
  } catch {
    /* ignore */
  }
}

export type YjsAuth =
  | { ok: true; projectId: string; filePath: string; session: Session }
  | { ok: false; reason: string };

export async function authorizeYjsRequest(
  req: IncomingMessage,
): Promise<YjsAuth> {
  const url = req.url ?? "";
  const m = url.match(/^\/_yjs\/([^/?]+)(?:\?.*)?$/);
  if (!m) return { ok: false, reason: "bad path" };
  const roomName = decodeURIComponent(m[1]);
  const idx = roomName.indexOf(":");
  if (idx < 0) return { ok: false, reason: "bad room" };
  const projectId = roomName.slice(0, idx);
  let b64 = roomName.slice(idx + 1).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const filePath = Buffer.from(b64, "base64").toString("utf8");

  const session = await readSessionFromCookieHeader(req.headers.cookie);
  let meta;
  try {
    meta = await readMeta(projectId);
  } catch {
    return { ok: false, reason: "project not found" };
  }
  if (!hasProjectAccess(session, meta.id, !meta.private)) {
    return { ok: false, reason: "no access" };
  }
  return { ok: true, projectId, filePath, session: session! };
}

export async function handleYjsConnection(
  ws: WebSocket,
  _req: IncomingMessage,
  auth: Extract<YjsAuth, { ok: true }>,
): Promise<void> {
  const { projectId, filePath } = auth;

  let room: Room;
  try {
    room = await getRoom(projectId, filePath);
  } catch (err) {
    console.error("getRoom failed", err);
    ws.close(1011, "no room");
    return;
  }

  attachConnection(room, ws);
  ws.binaryType = "arraybuffer";

  // Send initial sync step 1 + awareness state
  {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, messageSync);
    syncProtocol.writeSyncStep1(enc, room.doc);
    safeSend(ws, encoding.toUint8Array(enc));
  }
  {
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const aenc = encoding.createEncoder();
      encoding.writeVarUint(aenc, messageAwareness);
      encoding.writeVarUint8Array(
        aenc,
        awarenessProtocol.encodeAwarenessUpdate(
          room.awareness,
          Array.from(states.keys()),
        ),
      );
      safeSend(ws, encoding.toUint8Array(aenc));
    }
  }

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === ws) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, messageSync);
    syncProtocol.writeUpdate(enc, update);
    safeSend(ws, encoding.toUint8Array(enc));
  };
  const onAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === ws) return;
    const changedClients = [...added, ...updated, ...removed];
    if (changedClients.length === 0) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, messageAwareness);
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients),
    );
    safeSend(ws, encoding.toUint8Array(enc));
  };

  room.doc.on("update", onDocUpdate);
  room.awareness.on("update", onAwarenessUpdate);

  ws.on("message", (data: ArrayBuffer | Buffer) => {
    try {
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const dec = decoding.createDecoder(bytes);
      const enc = encoding.createEncoder();
      const messageType = decoding.readVarUint(dec);
      switch (messageType) {
        case messageSync: {
          encoding.writeVarUint(enc, messageSync);
          syncProtocol.readSyncMessage(dec, enc, room.doc, ws);
          if (encoding.length(enc) > 1) {
            safeSend(ws, encoding.toUint8Array(enc));
          }
          break;
        }
        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(dec),
            ws,
          );
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("yjs message error", err);
    }
  });

  const cleanup = () => {
    room.doc.off("update", onDocUpdate);
    room.awareness.off("update", onAwarenessUpdate);
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      Array.from(room.awareness.getStates().keys()).filter((cid) => {
        const meta = (room.awareness as unknown as { meta: Map<number, { clock: number; lastUpdated: number }> }).meta.get(cid);
        return meta != null;
      }),
      ws,
    );
    detachConnection(room, ws);
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

export type { Y };
