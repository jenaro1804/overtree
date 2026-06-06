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

// --- Project discovery index -------------------------------------------------
// The project id (a stable UUID) is decoupled from where its folder lives or how
// it's named. Instead of assuming `<root>/<id>`, we DISCOVER each project by
// scanning rootDir for `.overtree/project.json` and mapping id -> absolute dir.
// This lets folders be renamed/grouped into subject folders (and dragged around
// in OneDrive) without breaking the cache, Yjs rooms or URLs (all keyed by id).

export type ProjectScan = {
  /** id -> absolute project dir */
  projects: Map<string, string>;
  /** subject folders (dirs that aren't projects), relative to root, "/"-joined */
  folders: string[];
};

let cachedScan: ProjectScan | null = null;

const SCAN_SKIP_DIRS = new Set(["output", "node_modules"]);

async function scanWalk(
  dir: string,
  root: string,
  scan: ProjectScan,
): Promise<void> {
  // A dir holding .overtree/project.json IS a project: record it, don't descend
  // (projects never nest inside projects).
  const metaPath = path.join(dir, ".overtree", "project.json");
  if (await exists(metaPath)) {
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as {
        id?: unknown;
      };
      if (typeof meta.id === "string" && isSafeId(meta.id)) {
        scan.projects.set(meta.id, dir);
      }
    } catch {
      /* malformed meta — skip */
    }
    return;
  }
  // Not a project: it's a subject folder (unless it's the root itself).
  if (dir !== root) {
    scan.folders.push(path.relative(root, dir).split(path.sep).join("/"));
  }
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || SCAN_SKIP_DIRS.has(e.name)) continue;
    await scanWalk(path.join(dir, e.name), root, scan);
  }
}

/** Build (and cache) the id->dir index plus the list of subject folders. */
export async function buildProjectScan(): Promise<ProjectScan> {
  const root = await projectsRoot();
  const scan: ProjectScan = { projects: new Map(), folders: [] };
  await scanWalk(root, root, scan);
  scan.folders.sort();
  cachedScan = scan;
  return scan;
}

/** Cached scan, or a fresh one. Pass force=true to always rescan disk. */
export async function getProjectScan(force = false): Promise<ProjectScan> {
  if (force || !cachedScan) return buildProjectScan();
  return cachedScan;
}

/** Drop the cached scan. Call after create/rename/move/delete of projects/folders. */
export function invalidateProjectIndex(): void {
  cachedScan = null;
}

export async function projectDir(id: string): Promise<string> {
  if (!isSafeId(id)) throw new Error(`invalid project id: ${id}`);
  let scan = await getProjectScan();
  let dir = scan.projects.get(id);
  // Miss, or the cached dir was moved/deleted out from under us → rescan once.
  if (!dir || !(await exists(dir))) {
    scan = await buildProjectScan();
    dir = scan.projects.get(id);
  }
  if (!dir) throw new Error(`project not found: ${id}`);
  return dir;
}

// --- Folder/slug helpers -----------------------------------------------------

/** Filesystem-safe, readable slug from a project/subject name. */
export function slugify(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "proyecto";
}

/** A slug not yet taken under parentAbs (tries slug, slug-2, slug-3, …). */
export async function uniqueSlug(
  parentAbs: string,
  slug: string,
): Promise<string> {
  let candidate = slug;
  let n = 2;
  while (await exists(path.join(parentAbs, candidate))) {
    candidate = `${slug}-${n++}`;
  }
  return candidate;
}

/**
 * Resolve a subject-folder path relative to rootDir, refusing .. or absolute
 * paths. Empty string → rootDir itself. Returns absolute path.
 */
export async function resolveFolderPath(rel: string): Promise<string> {
  const root = await projectsRoot();
  if (!rel) return root;
  if (path.isAbsolute(rel)) {
    throw new Error(`absolute path not allowed: ${rel}`);
  }
  const abs = path.resolve(root, rel);
  const back = path.relative(root, abs);
  if (back.startsWith("..") || path.isAbsolute(back)) {
    throw new Error(`folder escapes root: ${rel}`);
  }
  return abs;
}

/** Rename/move a directory, retrying briefly to ride out OneDrive/watcher locks. */
export async function moveDirWithRetry(
  from: string,
  to: string,
  retries = 3,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (attempt >= retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
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
