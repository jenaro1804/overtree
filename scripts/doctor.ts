#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { loadSettings } from "../lib/core/settings";
import { getAllLanIps } from "../lib/lan";

function check(label: string, ok: boolean, hint?: string) {
  const mark = ok ? "✅" : "❌";
  console.log(`${mark} ${label}`);
  if (!ok && hint) console.log(`   → ${hint}`);
}

async function main() {
  console.log("Overtree doctor\n");

  const tectonic = spawnSync("which", ["tectonic"]);
  const tectonicOk = tectonic.status === 0;
  check(
    "tectonic installed",
    tectonicOk,
    "Install with: brew install tectonic",
  );
  if (tectonicOk) {
    const ver = spawnSync("tectonic", ["--version"]);
    console.log(`   ${ver.stdout.toString().trim()}`);
  }

  const settings = await loadSettings();
  check("settings.json readable", true);
  console.log(`   rootDir: ${settings.rootDir}`);
  console.log(`   port:    ${settings.port}`);

  const ips = getAllLanIps();
  check("LAN IP detected", ips.length > 0);
  for (const ip of ips) console.log(`   http://${ip}:${settings.port}`);

  if (!tectonicOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
