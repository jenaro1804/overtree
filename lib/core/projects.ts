import { promises as fs } from "node:fs";
import path from "node:path";
import {
  exists,
  isSafeId,
  newProjectId,
  projectDir,
  projectMetaDir,
  projectMetaFile,
  projectsRoot,
} from "./storage";
import { copyTemplate, listTemplates } from "./templates";

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
>;

export async function listProjects(): Promise<ProjectSummary[]> {
  const root = await projectsRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const out: ProjectSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !isSafeId(e.name)) continue;
    try {
      const meta = await readMeta(e.name);
      out.push({
        id: meta.id,
        name: meta.name,
        mainFile: meta.mainFile,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        private: meta.private,
      });
    } catch {
      // skip malformed projects
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
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
};

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectMeta> {
  const templates = await listTemplates();
  const template = input.template ?? "article";
  if (!templates.includes(template)) {
    throw new Error(`unknown template: ${template}`);
  }
  const id = newProjectId();
  const dir = await projectDir(id);
  await fs.mkdir(dir, { recursive: true });
  await copyTemplate(template, dir);
  const mainFile = await detectMainFile(dir);
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    name: input.name.trim() || "Untitled",
    mainFile,
    engine: "tectonic",
    template,
    createdAt: now,
    updatedAt: now,
    private: !!input.private,
    passwordHash: input.passwordHash,
  };
  await writeMeta(meta);
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
  await fs.rm(dir, { recursive: true, force: true });
}

export async function renameProject(id: string, name: string): Promise<ProjectMeta> {
  const meta = await readMeta(id);
  meta.name = name.trim() || meta.name;
  meta.updatedAt = Date.now();
  await writeMeta(meta);
  return meta;
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
