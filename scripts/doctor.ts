#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadSettings } from "../lib/core/settings";
import { getAllLanIps } from "../lib/lan";

function check(label: string, ok: boolean, hint?: string) {
  const mark = ok ? "OK " : "FAIL";
  console.log(`[${mark}] ${label}`);
  if (!ok && hint) console.log(`   -> ${hint}`);
}

async function main() {
  console.log("Overtree doctor\n");

  const settings = await loadSettings();

  let tectonicCmd: string | null = null;
  if (settings.tectonicPath) {
    if (existsSync(settings.tectonicPath)) {
      tectonicCmd = settings.tectonicPath;
    } else {
      check(
        "settings.tectonicPath",
        false,
        `Path does not exist: ${settings.tectonicPath}`,
      );
    }
  }
  if (!tectonicCmd) {
    const found = spawnSync("where", ["tectonic"], { shell: false });
    if (found.status === 0) tectonicCmd = "tectonic";
  }

  const tectonicOk = tectonicCmd !== null;
  check(
    "tectonic installed",
    tectonicOk,
    "Download the x86_64-pc-windows-msvc zip from " +
      "https://github.com/tectonic-typesetting/tectonic/releases/latest, " +
      "extract tectonic.exe to a folder on your PATH (or set settings.tectonicPath).",
  );
  if (tectonicOk) {
    const ver = spawnSync(tectonicCmd as string, ["--version"], {
      shell: false,
    });
    console.log(`   ${ver.stdout.toString().trim()}`);
  }

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
