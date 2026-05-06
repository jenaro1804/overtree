import WebSocket from "ws";
const ws = new WebSocket("ws://localhost:3737/_next/webpack-hmr");
console.log("connecting...");
ws.on("open", () => console.log("OPEN"));
ws.on("message", (d) => {
  try {
    const obj = JSON.parse(d.toString());
    console.log("MSG action=" + (obj.action || obj.type || "?"));
  } catch {
    console.log("MSG raw:", d.toString().slice(0, 60));
  }
});
ws.on("close", (c, r) => { console.log("CLOSE", c, r?.toString()); process.exit(0); });
ws.on("error", (e) => { console.log("ERR", e.message); process.exit(0); });
setTimeout(() => { console.log("(closing)"); ws.close(); }, 4000);
