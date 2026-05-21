import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadSettings } from "@/lib/core/settings";
import { getAllLanIps } from "@/lib/lan";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await loadSettings();
  const ips = getAllLanIps();
  const stdioBin = path.resolve(process.cwd(), "mcp-server/stdio.ts");
  // Robust MCP snippet that works on classic AND MSIX Claude Desktop: absolute
  // npx.cmd (lives next to the node.exe running this server), cwd, and tsconfig
  // for tsx's @/* alias. All derived — nothing hardcoded.
  const npxCmd = path.join(path.dirname(process.execPath), "npx.cmd");
  const mcpCommand = existsSync(npxCmd) ? npxCmd : "npx.cmd";
  let tectonicOk = false;
  if (settings.tectonicPath && existsSync(settings.tectonicPath)) {
    tectonicOk = true;
  } else {
    const tectonic = spawnSync("where", ["tectonic"], { shell: false });
    tectonicOk = tectonic.status === 0;
  }
  const port = settings.port;
  const lanUrl = ips[0]
    ? `http://${ips[0]}:${port}`
    : `http://localhost:${port}`;
  return NextResponse.json({
    rootDir: settings.rootDir,
    port,
    ips,
    lanUrl,
    tectonicAvailable: tectonicOk,
    mcpStdioBin: stdioBin,
    mcpCommand,
    mcpCwd: process.cwd(),
    mcpTsconfig: path.join(process.cwd(), "tsconfig.json"),
    mcpHttpUrl: `${lanUrl}/api/mcp`,
  });
}
