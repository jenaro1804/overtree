import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildProjectScan,
  exists,
  getProjectScan,
  invalidateProjectIndex,
  isSafeId,
  moveDirWithRetry,
  newProjectId,
  projectDir,
  projectMetaDir,
  projectMetaFile,
  projectsRoot,
  resolveFolderPath,
  slugify,
  uniqueSlug,
} from "./storage";
import { copyTemplate, listTemplates } from "./templates";
import { docManager } from "@/lib/yjs/doc-manager-bridge";

// Go through the globalThis bridge instead of importing doc-manager directly: it
// avoids the static cycle (projects → doc-manager → files → projects), keeps yjs
// and chokidar out of this module's graph, and reaches the single WS-side
// doc-manager instance (see doc-manager-bridge).
async function closeProjectRooms(projectId: string): Promise<void> {
  await docManager().closeProjectRooms(projectId);
}

export type ProjectMeta = {
  id: string;
  name: string;
  mainFile: string;
  engine: "tectonic";
  template: string;
  createdAt: number;
  updatedAt: number;
  private: boolean;
  passwordHash?: string;
};

export type ProjectSummary = Pick<
  ProjectMeta,
  "id" | "name" | "mainFile" | "createdAt" | "updatedAt" | "private"
> & {
  /** Subject folder relative to rootDir ("" = root, no subject). */
  folder: string;
};

/** Relative subject folder for a project dir (parent relative to root). */
function folderOf(root: string, dir: string): string {
  return path.relative(root, path.dirname(dir)).split(path.sep).join("/");
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const root = await projectsRoot();
  const scan = await buildProjectScan(); // fresh: reflect OneDrive drags
  const out: ProjectSummary[] = [];
  for (const [id, dir] of scan.projects) {
    try {
      const meta = await readMeta(id);
      out.push({
        id: meta.id,
        name: meta.name,
        mainFile: meta.mainFile,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        private: meta.private,
        folder: folderOf(root, dir),
      });
    } catch {
      // skip malformed projects
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

/** All subject folders (including empty ones), relative to root. */
export async function listFolders(): Promise<string[]> {
  const scan = await getProjectScan(true);
  return scan.folders;
}

export async function readMeta(id: string): Promise<ProjectMeta> {
  const file = await projectMetaFile(id);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as ProjectMeta;
}

export async function writeMeta(meta: ProjectMeta): Promise<void> {
  const dir = await projectMetaDir(meta.id);
  await fs.mkdir(dir, { recursive: true });
  const file = await projectMetaFile(meta.id);
  await fs.writeFile(file, JSON.stringify(meta, null, 2), "utf8");
}

/** Write project.json directly under a known project dir (id not yet indexed). */
async function writeMetaToDir(dir: string, meta: ProjectMeta): Promise<void> {
  const metaDir = path.join(dir, ".overtree");
  await fs.mkdir(metaDir, { recursive: true });
  await fs.writeFile(
    path.join(metaDir, "project.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
}

export async function touchProject(id: string): Promise<void> {
  const meta = await readMeta(id);
  meta.updatedAt = Date.now();
  await writeMeta(meta);
}

export type CreateProjectInput = {
  name: string;
  template?: string;
  private?: boolean;
  passwordHash?: string;
  /** Subject folder relative to root ("" / undefined = root). */
  folder?: string;
};

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectMeta> {
  const templates = await listTemplates();
  const template = input.template ?? "article";
  if (!templates.includes(template)) {
    throw new Error(`unknown template: ${template}`);
  }
  const name = input.name.trim() || "Untitled";
  // Place the folder under its subject, with a readable, unique slug. The id
  // stays a UUID and is decoupled from the folder name.
  const parentAbs = await resolveFolderPath((input.folder ?? "").trim());
  await fs.mkdir(parentAbs, { recursive: true });
  const slug = await uniqueSlug(parentAbs, slugify(name));
  const dir = path.join(parentAbs, slug);
  const id = newProjectId();
  await fs.mkdir(dir, { recursive: true });
  await copyTemplate(template, dir);
  const mainFile = await detectMainFile(dir);
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    name,
    mainFile,
    engine: "tectonic",
    template,
    createdAt: now,
    updatedAt: now,
    private: !!input.private,
    passwordHash: input.passwordHash,
  };
  // Write meta directly to the known dir (projectDir(id) can't resolve it yet),
  // then invalidate so the next lookup discovers it by scan.
  await writeMetaToDir(dir, meta);
  invalidateProjectIndex();
  return meta;
}

async function detectMainFile(dir: string): Promise<string> {
  const candidates = ["main.tex", "index.tex", "document.tex"];
  for (const c of candidates) {
    if (await exists(path.join(dir, c))) return c;
  }
  // fall back to any .tex at top
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".tex")) return e.name;
  }
  return "main.tex";
}

export async function deleteProject(id: string): Promise<void> {
  if (!isSafeId(id)) throw new Error(`invalid id: ${id}`);
  const dir = await projectDir(id);
  await closeProjectRooms(id); // release watcher/file locks before rm
  await fs.rm(dir, { recursive: true, force: true });
  invalidateProjectIndex();
}

/**
 * Rename a project. Keeps the folder name in sync with the readable name by
 * moving the folder (under the SAME subject) to a fresh slug. The folder move
 * happens FIRST; only on success do we update meta.name, so name and folder
 * never drift apart. The id is untouched (cache/Yjs/URLs stay valid).
 */
export async function renameProject(
  id: string,
  name: string,
): Promise<ProjectMeta> {
  const meta = await readMeta(id);
  const nextName = name.trim() || meta.name;
  const dir = await projectDir(id);
  const parentAbs = path.dirname(dir);
  const currentSlug = path.basename(dir);
  const desiredSlug = slugify(nextName);

  if (desiredSlug !== currentSlug) {
    const newSlug = await uniqueSlug(parentAbs, desiredSlug);
    const newDir = path.join(parentAbs, newSlug);
    await closeProjectRooms(id); // release locks so the rename can succeed
    await moveDirWithRetry(dir, newDir);
    invalidateProjectIndex();
  }

  meta.name = nextName;
  meta.updatedAt = Date.now();
  await writeMeta(meta); // projectDir(id) now resolves to the moved dir
  return meta;
}

/** Move a project to a different subject folder (same slug; id untouched). */
export async function moveProject(
  id: string,
  folder: string,
): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  const slug = path.basename(dir);
  const destParent = await resolveFolderPath((folder ?? "").trim());
  await fs.mkdir(destParent, { recursive: true });
  const newSlug = await uniqueSlug(destParent, slug);
  const newDir = path.join(destParent, newSlug);
  if (path.resolve(newDir) === path.resolve(dir)) {
    return readMeta(id); // already there
  }
  await closeProjectRooms(id);
  await moveDirWithRetry(dir, newDir);
  invalidateProjectIndex();
  await touchProject(id);
  return readMeta(id);
}

// --- Subject folder operations ----------------------------------------------

/** Create an (empty) subject folder. */
export async function createFolder(rel: string): Promise<void> {
  const abs = await resolveFolderPath(rel.trim());
  const root = await projectsRoot();
  if (path.resolve(abs) === path.resolve(root)) {
    throw new Error("invalid folder name");
  }
  await fs.mkdir(abs, { recursive: true });
  invalidateProjectIndex();
}

/** Rename/move a subject folder. Closes rooms of any projects inside first. */
export async function renameFolder(
  rel: string,
  newRel: string,
): Promise<void> {
  const from = await resolveFolderPath(rel.trim());
  const to = await resolveFolderPath(newRel.trim());
  const root = await projectsRoot();
  if (path.resolve(from) === path.resolve(root)) {
    throw new Error("cannot rename root");
  }
  // Release locks for every project living under this folder.
  const scan = await getProjectScan(true);
  for (const [pid, dir] of scan.projects) {
    const back = path.relative(from, dir);
    if (!back.startsWith("..") && !path.isAbsolute(back)) {
      await closeProjectRooms(pid);
    }
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await moveDirWithRetry(from, to);
  invalidateProjectIndex();
}

/** Delete a subject folder, only if empty. */
export async function deleteFolder(rel: string): Promise<void> {
  const abs = await resolveFolderPath(rel.trim());
  const root = await projectsRoot();
  if (path.resolve(abs) === path.resolve(root)) {
    throw new Error("cannot delete root");
  }
  const entries = await fs.readdir(abs).catch(() => [] as string[]);
  if (entries.length > 0) {
    throw new Error("folder not empty");
  }
  await fs.rmdir(abs);
  invalidateProjectIndex();
}

export async function setProjectPassword(
  id: string,
  passwordHash: string | null,
): Promise<ProjectMeta> {
  const meta = await readMeta(id);
  if (passwordHash) {
    meta.private = true;
    meta.passwordHash = passwordHash;
  } else {
    meta.private = false;
    delete meta.passwordHash;
  }
  meta.updatedAt = Date.now();
  await writeMeta(meta);
  return meta;
}
