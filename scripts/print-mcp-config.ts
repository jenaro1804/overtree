#!/usr/bin/env bun
import path from "node:path";
import { existsSync } from "node:fs";
import { loadSettings } from "../lib/core/settings";
import { getAllLanIps } from "../lib/lan";

async function main() {
  const settings = await loadSettings();
  const ips = getAllLanIps();
  const lanUrl = ips[0] ? `http://${ips[0]}:${settings.port}` : `http://localhost:${settings.port}`;
  const stdioBin = path.resolve(process.cwd(), "mcp-server/stdio.ts");
  // Absolute npx.cmd (next to the node.exe running this) so the snippet works
  // on both classic and MSIX Claude Desktop. Everything derived — no hardcoding.
  const npxCmd = path.join(path.dirname(process.execPath), "npx.cmd");
  const command = existsSync(npxCmd) ? npxCmd : "npx.cmd";

  console.log("\n  Overtree MCP — connect your AI clients\n");

  console.log("- Claude Desktop");
  console.log(
    `  In Claude Desktop: Settings → Developer → Edit config (opens the right`,
  );
  console.log(
    `  file for your build — classic %APPDATA%\\Claude\\ or MSIX LocalCache).`,
  );
  console.log(`  Paste this into "mcpServers":`);
  console.log("");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          overtree: {
            command,
            args: ["-y", "tsx", stdioBin],
            cwd: process.cwd(),
            env: { TSX_TSCONFIG_PATH: path.resolve(process.cwd(), "tsconfig.json") },
          },
        },
      },
      null,
      2,
    ),
  );
  console.log("");
  console.log("  Then quit Claude Desktop from the tray and reopen it.");
  console.log("");

  console.log("- Claude Code CLI");
  console.log("  Run once:");
  console.log(`    claude mcp add overtree -- npx -y tsx "${stdioBin}"`);
  console.log("");

  console.log("• ChatGPT Desktop (HTTP/SSE)");
  console.log("  In Settings → Connectors → Add MCP server, use this URL:");
  console.log(`    ${lanUrl}/api/mcp`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
