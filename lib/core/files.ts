import { promises as fs } from "node:fs";
import path from "node:path";
import {
  exists,
  isSafeId,
  projectDir,
  resolveInProject,
} from "./storage";
import { touchProject } from "./projects";

export type FileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
  children?: FileNode[];
};

const HIDDEN_TOPLEVEL = new Set([".overtree"]);

export async function listFiles(id: string): Promise<FileNode[]> {
  if (!isSafeId(id)) throw new Error(`invalid id: ${id}`);
  const dir = await projectDir(id);
  return await walk(dir, "");
}

async function walk(absDir: string, relDir: string): Promise<FileNode[]> {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const out: FileNode[] = [];
  for (const e of entries) {
    if (relDir === "" && HIDDEN_TOPLEVEL.has(e.name)) continue;
    const rel = relDir ? path.posix.join(relDir, e.name) : e.name;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      out.push({
        name: e.name,
        path: rel,
        kind: "dir",
        children: await walk(abs, rel),
      });
    } else if (e.isFile()) {
      const s = await fs.stat(abs);
      out.push({ name: e.name, path: rel, kind: "file", size: s.size });
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export async function readFile(id: string, relPath: string): Promise<string> {
  const abs = await resolveInProject(id, relPath);
  return await fs.readFile(abs, "utf8");
}

export type CiteEntry = { key: string; title?: string };
export type LabelEntry = { key: string; file?: string };
export type ProjectSymbols = {
  citations: CiteEntry[];
  labels: LabelEntry[];
  texFiles: string[];
  imageFiles: string[];
};

// @comment/@string/@preamble/@set aren't citable references.
const SKIP_BIB_TYPES = new Set(["comment", "string", "preamble", "set"]);
const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".gif",
  ".eps",
  ".svg",
]);

// Scan the whole project once for the symbols the editor autocompletes:
// citation keys (.bib), \label keys (.tex), and the .tex / image paths used by
// \input/\include and \includegraphics. Pragmatic regex parses (no full BibTeX
// grammar) — good enough for a dropdown.
export async function listProjectSymbols(id: string): Promise<ProjectSymbols> {
  if (!isSafeId(id)) throw new Error(`invalid id: ${id}`);
  const tree = await listFiles(id);

  const files: string[] = [];
  const collect = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.kind === "dir") collect(n.children ?? []);
      else files.push(n.path);
    }
  };
  collect(tree);

  const citations: CiteEntry[] = [];
  const labels: LabelEntry[] = [];
  const texFiles: string[] = [];
  const imageFiles: string[] = [];
  const seenCite = new Set<string>();
  const seenLabel = new Set<string>();

  for (const p of files) {
    const lower = p.toLowerCase();
    const ext = path.posix.extname(lower);

    if (IMAGE_EXTS.has(ext)) {
      imageFiles.push(p);
      continue;
    }

    if (ext === ".bib") {
      const content = await readFile(id, p).catch(() => null);
      if (content == null) continue;
      const entryRe = /@(\w+)\s*\{\s*([^,\s}]+)\s*,([\s\S]*?)(?=@\w+\s*\{|$)/g;
      let m: RegExpExecArray | null;
      while ((m = entryRe.exec(content))) {
        if (SKIP_BIB_TYPES.has(m[1].toLowerCase())) continue;
        const key = m[2];
        if (seenCite.has(key)) continue;
        seenCite.add(key);
        const titleMatch = m[3].match(/title\s*=\s*[{"]\s*([^{}"\n]+)/i);
        citations.push({ key, title: titleMatch?.[1]?.trim() || undefined });
      }
      continue;
    }

    if (ext === ".tex") {
      texFiles.push(p);
      const content = await readFile(id, p).catch(() => null);
      if (content == null) continue;
      const labelRe = /\\label\s*\{([^}]+)\}/g;
      let lm: RegExpExecArray | null;
      while ((lm = labelRe.exec(content))) {
        const key = lm[1].trim();
        if (!key || seenLabel.has(key)) continue;
        seenLabel.add(key);
        labels.push({ key, file: p });
      }
    }
  }

  citations.sort((a, b) => a.key.localeCompare(b.key));
  labels.sort((a, b) => a.key.localeCompare(b.key));
  texFiles.sort((a, b) => a.localeCompare(b));
  imageFiles.sort((a, b) => a.localeCompare(b));
  return { citations, labels, texFiles, imageFiles };
}

export async function readFileBinary(
  id: string,
  relPath: string,
): Promise<Buffer> {
  const abs = await resolveInProject(id, relPath);
  return await fs.readFile(abs);
}

export async function writeFile(
  id: string,
  relPath: string,
  content: string | Buffer,
): Promise<void> {
  const abs = await resolveInProject(id, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
  await touchProject(id);
}

export async function editFile(
  id: string,
  relPath: string,
  oldString: string,
  newString: string,
): Promise<void> {
  const current = await readFile(id, relPath);
  if (!oldString) throw new Error("oldString cannot be empty");
  const idx = current.indexOf(oldString);
  if (idx === -1) throw new Error("oldString not found in file");
  if (current.indexOf(oldString, idx + oldString.length) !== -1) {
    throw new Error("oldString matches multiple times — provide more context");
  }
  const next = current.slice(0, idx) + newString + current.slice(idx + oldString.length);
  await writeFile(id, relPath, next);
}

export async function deleteFile(id: string, relPath: string): Promise<void> {
  const abs = await resolveInProject(id, relPath);
  if (!(await exists(abs))) return;
  const stat = await fs.stat(abs);
  if (stat.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: true });
  } else {
    await fs.unlink(abs);
  }
  await touchProject(id);
}

export async function renameFile(
  id: string,
  fromRel: string,
  toRel: string,
): Promise<void> {
  const fromAbs = await resolveInProject(id, fromRel);
  const toAbs = await resolveInProject(id, toRel);
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
  await touchProject(id);
}

export async function mkdir(id: string, relPath: string): Promise<void> {
  const abs = await resolveInProject(id, relPath);
  await fs.mkdir(abs, { recursive: true });
  await touchProject(id);
}
