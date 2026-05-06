#!/usr/bin/env bun
import path from "node:path";
import { loadSettings } from "../lib/core/settings";
import { getAllLanIps } from "../lib/lan";

async function main() {
  const settings = await loadSettings();
  const ips = getAllLanIps();
  const lanUrl = ips[0] ? `http://${ips[0]}:${settings.port}` : `http://localhost:${settings.port}`;
  const stdioBin = path.resolve(process.cwd(), "mcp-server/stdio.ts");

  console.log("\n  Overtree MCP — connect your AI clients\n");

  console.log("• Claude Desktop");
  console.log(`  Edit ~/Library/Application\\ Support/Claude/claude_desktop_config.json:`);
  console.log("");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          overtree: {
            command: "bun",
            args: [stdioBin],
          },
        },
      },
      null,
      2,
    ),
  );
  console.log("");
  console.log("  Then restart Claude Desktop.");
  console.log("");

  console.log("• Claude Code CLI");
  console.log("  Run once:");
  console.log(`    claude mcp add overtree -- bun ${stdioBin}`);
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
