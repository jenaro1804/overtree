import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { loadSettings } from "./settings";

// Regenerable per-machine cache (Yjs state, compile output). Kept OUT of the
// project dir so it never syncs to OneDrive — the .bin churns every ~300ms and
// the PDF is rewritten on every compile, yet both rebuild from the source.
const CACHE_ROOT = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Overtree", "cache")
  : path.join(os.homedir(), "AppData", "Local", "Overtree", "cache");

/** Absolute cache dir for a project (NOT synced). Caller mkdirs subpaths. */
export function projectCacheDir(id: string): string {
  if (!isSafeId(id)) throw new Error(`invalid project id: ${id}`);
  return path.join(CACHE_ROOT, id);
}

/** Compile output dir (PDF + logs) in the per-machine cache, NOT synced. */
export function projectOutputDir(id: string): string {
  return path.join(projectCacheDir(id), "output");
}

export async function projectsRoot(): Promise<string> {
  const s = await loadSettings();
  await fs.mkdir(s.rootDir, { recursive: true });
  return s.rootDir;
}

export async function projectDir(id: string): Promise<string> {
  if (!isSafeId(id)) throw new Error(`invalid project id: ${id}`);
  const root = await projectsRoot();
  return path.join(root, id);
}

export async function projectMetaDir(id: string): Promise<string> {
  return path.join(await projectDir(id), ".overtree");
}

export async function projectMetaFile(id: string): Promise<string> {
  return path.join(await projectMetaDir(id), "project.json");
}

/**
 * Resolve a relative path inside a project, refusing anything that escapes
 * via .. or absolute paths. Returns absolute path.
 */
export async function resolveInProject(
  id: string,
  relPath: string,
): Promise<string> {
  if (path.isAbsolute(relPath)) {
    throw new Error(`absolute path not allowed: ${relPath}`);
  }
  const dir = await projectDir(id);
  const abs = path.resolve(dir, relPath);
  const rel = path.relative(dir, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path escapes project: ${relPath}`);
  }
  return abs;
}

export function isSafeId(id: string): boolean {
  return /^[a-z0-9-]{8,64}$/i.test(id);
}

export function newProjectId(): string {
  return crypto.randomUUID();
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
