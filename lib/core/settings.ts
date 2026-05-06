import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export type Settings = {
  rootDir: string;
  port: number;
  defaultEngine: "tectonic";
  tectonicPath?: string;
  sessionSecret: string;
};

const SETTINGS_DIR = path.join(os.homedir(), ".overtree");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");
const DEFAULT_PROJECTS_ROOT = path.join(os.homedir(), "Documents", "Overtree", "projects");

function defaults(): Settings {
  return {
    rootDir: DEFAULT_PROJECTS_ROOT,
    port: 3000,
    defaultEngine: "tectonic",
    sessionSecret: randomSecret(),
  };
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

let cached: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (cached) return cached;
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    cached = { ...defaults(), ...parsed };
    if (!parsed.sessionSecret) {
      await saveSettings(cached);
    }
  } catch {
    cached = defaults();
    await saveSettings(cached);
  }
  await fs.mkdir(cached.rootDir, { recursive: true });
  return cached;
}

export async function saveSettings(next: Settings): Promise<void> {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  cached = next;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export function settingsPath(): string {
  return SETTINGS_FILE;
}
