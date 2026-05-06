// Simulate a browser opening a project file via Yjs and editing.
// Verifies that Y.Text updates flush to disk.
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = 3737;
const projectId = process.argv[2];
if (!projectId) {
  console.error("usage: node scripts/yjs-probe.mjs <projectId>");
  process.exit(1);
}

const filePath = "main.tex";
const room = `${projectId}:${Buffer.from(filePath).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
const projectsRoot = path.join(os.homedir(), "Documents/Overtree/projects");
const diskPath = path.join(projectsRoot, projectId, filePath);

const joinRes = await fetch(`http://localhost:${PORT}/api/join/${projectId}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Probe" }),
});
const setCookie = joinRes.headers.get("set-cookie") || "";
const cookieMatch = setCookie.match(/overtree_session=([^;]+)/);
const cookie = `overtree_session=${cookieMatch[1]}`;
console.log("[1] joined");

const ws = new WebSocket(`ws://localhost:${PORT}/_yjs/${room}`, {
  headers: { Cookie: cookie },
});
ws.binaryType = "arraybuffer";

const ydoc = new Y.Doc();
const ytext = ydoc.getText("content");
const messageSync = 0;

// Register update listener BEFORE any local edits
ydoc.on("update", (update, origin) => {
  if (origin === ws) return; // skip updates that came FROM the server
  const e2 = encoding.createEncoder();
  encoding.writeVarUint(e2, messageSync);
  syncProtocol.writeUpdate(e2, update);
  ws.send(encoding.toUint8Array(e2));
  console.log(`[update->] ${update.length} bytes sent to server`);
});

ws.on("open", () => {
  console.log("[2] WS open, sending sync step 1");
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, messageSync);
  syncProtocol.writeSyncStep1(enc, ydoc);
  ws.send(encoding.toUint8Array(enc));
});

let edited = false;
ws.on("message", async (raw) => {
  const bytes = new Uint8Array(raw);
  const dec = decoding.createDecoder(bytes);
  const type = decoding.readVarUint(dec);
  if (type !== messageSync) return;
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, messageSync);
  // origin = ws, so our update listener can detect "came from server"
  syncProtocol.readSyncMessage(dec, enc, ydoc, ws);
  if (encoding.length(enc) > 1) {
    ws.send(encoding.toUint8Array(enc));
  }

  // Wait until first sync round trip completes, then check + edit
  if (!edited) {
    edited = true;
    setTimeout(async () => {
      const initial = ytext.toString();
      console.log(`[3] after sync, Y.Text length=${initial.length}, first 80=${JSON.stringify(initial.slice(0, 80))}`);
      const diskBefore = await fs.readFile(diskPath, "utf8");
      console.log(`[4] disk length=${diskBefore.length}, match Y.Text? ${diskBefore === initial}`);

      const stamp = `% PROBE-${Date.now()}\n`;
      ytext.insert(ytext.length, stamp);
      console.log(`[5] inserted ${stamp.length} chars`);

      setTimeout(async () => {
        const diskAfter = await fs.readFile(diskPath, "utf8");
        const changed = diskAfter !== diskBefore;
        console.log(`[6] after 2.5s: disk length=${diskAfter.length}, changed=${changed}`);
        if (changed) {
          console.log("    last 80:", JSON.stringify(diskAfter.slice(-80)));
        }
        ws.close();
        process.exit(changed ? 0 : 1);
      }, 2500);
    }, 500);
  }
});

ws.on("close", (c, r) => console.log(`[X] close ${c} ${r?.toString() || ""}`));
ws.on("error", (e) => {
  console.error("WS ERR:", e.message);
  process.exit(1);
});
