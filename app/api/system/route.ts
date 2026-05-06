import { NextResponse } from "next/server";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadSettings } from "@/lib/core/settings";
import { getAllLanIps } from "@/lib/lan";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await loadSettings();
  const ips = getAllLanIps();
  const stdioBin = path.resolve(process.cwd(), "mcp-server/stdio.ts");
  const tectonic = spawnSync("which", ["tectonic"]);
  const tectonicOk = tectonic.status === 0;
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
    mcpHttpUrl: `${lanUrl}/api/mcp`,
  });
}
