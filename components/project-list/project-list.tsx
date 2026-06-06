"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  SettingsIcon,
  XIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectCard } from "./project-card";
import { SubjectSection, type SubjectHandlers } from "./subject-section";
import {
  type Layout,
  type Project,
  type SortMode,
  buildTree,
  groupByFolder,
  ROOT_KEY,
} from "./tree";

const COLLAPSE_KEY = "overtree.collapsed";
const EMPTY_LAYOUT: Layout = { subjectOrder: [], projectOrder: {}, sort: {} };

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved) setCollapsed(new Set(JSON.parse(saved) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  async function reload() {
    const [pr, lr] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/layout").then((r) => r.json()),
    ]);
    setProjects(pr.projects ?? []);
    setFolders(pr.folders ?? []);
    setLayout(lr.layout ?? EMPTY_LAYOUT);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function saveLayout(next: Layout) {
    setLayout(next);
    await fetch("/api/layout", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  // --- Project handlers ------------------------------------------------------
  async function onDeleteProject(id: string, name: string) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    reload();
  }

  async function onRenameProject(id: string, current: string) {
    const next = prompt("Rename project", current);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === current) return;
    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) alert((await r.json().catch(() => ({})))?.error ?? "Could not rename");
    reload();
  }

  async function onMoveProject(id: string, folder: string) {
    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (!r.ok) alert((await r.json().catch(() => ({})))?.error ?? "Could not move");
    reload();
  }

  // --- Subject (folder) handlers --------------------------------------------
  function badSegment(name: string): boolean {
    if (name.includes("/") || name.includes("\\")) {
      alert("Use the tree to nest — names can't contain slashes.");
      return true;
    }
    return false;
  }

  async function createSubjectUnder(parent: string) {
    const name = prompt(parent ? `New sub-subject in "${parent}"` : "New subject name");
    if (name == null) return;
    const seg = name.trim();
    if (!seg || badSegment(seg)) return;
    const path = parent ? `${parent}/${seg}` : seg;
    const r = await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!r.ok) alert((await r.json().catch(() => ({})))?.error ?? "Could not create subject");
    reload();
  }

  async function onRenameSubject(path: string) {
    const parts = path.split("/");
    const base = parts[parts.length - 1];
    const parent = parts.slice(0, -1).join("/");
    const next = prompt("Rename subject", base);
    if (next == null) return;
    const seg = next.trim();
    if (!seg || seg === base || badSegment(seg)) return;
    const to = parent ? `${parent}/${seg}` : seg;
    const r = await fetch("/api/folders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: path, to }),
    });
    if (!r.ok) alert((await r.json().catch(() => ({})))?.error ?? "Could not rename subject");
    reload();
  }

  async function onDeleteSubject(path: string) {
    if (!confirm(`Delete subject "${path}"? (Only works if it's empty.)`)) return;
    const r = await fetch("/api/folders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!r.ok) alert((await r.json().catch(() => ({})))?.error ?? "Could not delete subject");
    reload();
  }

  function onChangeSort(folder: string, mode: SortMode) {
    saveLayout({ ...layout, sort: { ...layout.sort, [folder]: mode } });
  }

  function onToggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const handlers: SubjectHandlers = {
    onToggle,
    onChangeSort,
    onAddSub: createSubjectUnder,
    onRenameSubject,
    onDeleteSubject,
    onDeleteProject,
    onRenameProject,
    onMoveProject,
  };

  // --- Derived ---------------------------------------------------------------
  const byFolder = useMemo(() => groupByFolder(projects), [projects]);
  const tree = useMemo(
    () => buildTree(layout.subjectOrder, byFolder),
    [layout.subjectOrder, byFolder],
  );
  const hasSubjects = folders.length > 0;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, projects]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <header className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">Overtree</h1>
          <p className="text-muted text-sm mt-1">
            Local-first LaTeX editor with LAN collaboration
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <button
            onClick={() => createSubjectUnder(ROOT_KEY)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-border-strong text-sm text-foreground transition"
            title="New subject folder"
          >
            <FolderPlusIcon /> New subject
          </button>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-border-strong text-sm text-foreground transition"
            title="Settings & MCP setup"
          >
            <SettingsIcon /> Settings
          </Link>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-blue-500 text-white text-sm font-medium transition"
          >
            <PlusIcon /> New project
          </button>
        </div>
      </header>

      <div className="relative mb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-subtle hover:text-foreground"
            title="Clear"
          >
            <XIcon width={14} height={14} />
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : searchResults ? (
        searchResults.length === 0 ? (
          <p className="text-muted">No projects match “{query}”.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                folders={folders}
                onDelete={onDeleteProject}
                onRename={onRenameProject}
                onMove={onMoveProject}
              />
            ))}
          </ul>
        )
      ) : projects.length === 0 && !hasSubjects ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <FolderIcon className="mx-auto mb-3 text-subtle" width={32} height={32} />
          <p className="text-muted">No projects yet.</p>
          <button
            onClick={() => setOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface hover:bg-border-strong text-sm transition"
          >
            <PlusIcon /> Create your first project
          </button>
        </div>
      ) : !hasSubjects ? (
        // Flat view while there are no subjects (keeps the screen clean).
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(byFolder.get(ROOT_KEY) ?? []).map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              folders={folders}
              onDelete={onDeleteProject}
              onRename={onRenameProject}
              onMove={onMoveProject}
            />
          ))}
        </ul>
      ) : (
        <div className="space-y-8">
          {tree.projects.length > 0 && (
            <SubjectSection
              node={tree}
              depth={0}
              layout={layout}
              folders={folders}
              collapsed={collapsed}
              isRoot
              handlers={handlers}
            />
          )}
          {tree.children.map((child) => (
            <SubjectSection
              key={child.path}
              node={child}
              depth={0}
              layout={layout}
              folders={folders}
              collapsed={collapsed}
              handlers={handlers}
            />
          ))}
        </div>
      )}

      <NewProjectDialog
        open={open}
        folders={folders}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          reload();
        }}
      />
    </div>
  );
}
