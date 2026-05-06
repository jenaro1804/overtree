import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { loadSettings } from "./lib/core/settings";
import { getAllLanIps } from "./lib/lan";

const dev = process.env.NODE_ENV !== "production";

async function main() {
  const settings = await loadSettings();
  const port = Number(process.env.PORT ?? settings.port);
  const hostname = "0.0.0.0";

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("request error", err);
      res.statusCode = 500;
      res.end("internal error");
    });
  });

  const yjsWss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    const url = req.url ?? "";
    if (!url.startsWith("/_yjs/")) {
      socket.destroy();
      return;
    }
    try {
      const { handleYjsConnection, authorizeYjsRequest } = await import(
        "./lib/yjs/ws-server"
      );
      const auth = await authorizeYjsRequest(req);
      if (!auth.ok) {
        socket.write(`HTTP/1.1 401 Unauthorized\r\n\r\n`);
        socket.destroy();
        return;
      }
      yjsWss.handleUpgrade(req, socket, head, (ws) => {
        handleYjsConnection(ws, req, auth).catch((e) => {
          console.error("yjs upgrade error", e);
          ws.close();
        });
      });
    } catch (err) {
      console.error("upgrade error", err);
      socket.destroy();
    }
  });

  httpServer.listen(port, hostname, () => {
    const ips = getAllLanIps();
    console.log("\n  Overtree is up.\n");
    console.log(`  Local:    http://localhost:${port}`);
    for (const ip of ips) console.log(`  Network:  http://${ip}:${port}`);
    console.log("\n  Settings:", settings.rootDir);
    console.log("");
  });
}

main().catch((err) => {
  console.error("server boot failed", err);
  process.exit(1);
});
