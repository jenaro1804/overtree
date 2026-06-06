"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  LockIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewProjectDialog } from "./new-project-dialog";

type Project = {
  id: string;
  name: string;
  mainFile: string;
  createdAt: number;
  updatedAt: number;
  private: boolean;
  folder: string;
};

const ROOT_KEY = "";

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/projects");
    const j = await r.json();
    setProjects(j.projects ?? []);
    setFolders(j.folders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    reload();
  }

  async function onRename(id: string, current: string) {
    const next = prompt("Rename project", current);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === current) return;
    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not rename project");
    }
    reload();
  }

  async function onMove(id: string, folder: string) {
    setMoveMenuFor(null);
    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not move project");
    }
    reload();
  }

  async function onNewSubject() {
    const name = prompt("New subject folder name");
    if (name == null) return;
    const path = name.trim();
    if (!path) return;
    const r = await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not create subject");
    }
    reload();
  }

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Group projects by subject folder; keep empty subject folders visible too.
  const grouped = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const f of folders) map.set(f, []);
    for (const p of projects) {
      const key = p.folder || ROOT_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [projects, folders]);

  // Flat view while there are no subjects yet (keeps the screen clean).
  const hasSubjects = folders.length > 0 || projects.some((p) => p.folder);

  const sectionKeys = useMemo(() => {
    const keys = [...grouped.keys()].filter((k) => k !== ROOT_KEY).sort();
    if (grouped.has(ROOT_KEY)) keys.push(ROOT_KEY); // root projects last
    return keys;
  }, [grouped]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold">Overtree</h1>
          <p className="text-muted text-sm mt-1">
            Local-first LaTeX editor with LAN collaboration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={onNewSubject}
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

      {loading ? (
        <p className="text-muted">Loading…</p>
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
        <ProjectGrid
          projects={grouped.get(ROOT_KEY) ?? []}
          folders={folders}
          moveMenuFor={moveMenuFor}
          setMoveMenuFor={setMoveMenuFor}
          onDelete={onDelete}
          onRename={onRename}
          onMove={onMove}
        />
      ) : (
        <div className="space-y-8">
          {sectionKeys.map((key) => {
            const items = grouped.get(key) ?? [];
            const isCollapsed = collapsed.has(key);
            return (
              <section key={key || "(root)"}>
                <button
                  onClick={() => toggle(key)}
                  className="flex items-center gap-2 mb-4 text-sm font-medium text-muted hover:text-foreground transition"
                >
                  {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                  <FolderIcon width={14} height={14} />
                  {key === ROOT_KEY ? "No subject" : key}
                  <span className="text-subtle font-normal">({items.length})</span>
                </button>
                {!isCollapsed &&
                  (items.length === 0 ? (
                    <p className="text-sm text-subtle pl-6">Empty subject.</p>
                  ) : (
                    <ProjectGrid
                      projects={items}
                      folders={folders}
                      moveMenuFor={moveMenuFor}
                      setMoveMenuFor={setMoveMenuFor}
                      onDelete={onDelete}
                      onRename={onRename}
                      onMove={onMove}
                    />
                  ))}
              </section>
            );
          })}
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

type GridProps = {
  projects: Project[];
  folders: string[];
  moveMenuFor: string | null;
  setMoveMenuFor: (id: string | null) => void;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, folder: string) => void;
};

function ProjectGrid({
  projects,
  folders,
  moveMenuFor,
  setMoveMenuFor,
  onDelete,
  onRename,
  onMove,
}: GridProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => (
        <li
          key={p.id}
          className="group relative border border-border rounded-xl p-5 bg-panel hover:border-border-strong transition"
        >
          <Link href={`/projects/${p.id}`} className="block">
            <div className="flex items-center gap-2 mb-3 text-muted">
              <FolderIcon />
              {p.private && (
                <LockIcon width={12} height={12} className="text-amber-500" />
              )}
            </div>
            <h3 className="font-medium truncate pr-16">{p.name}</h3>
            <p className="text-xs text-muted mt-1 truncate">{p.mainFile}</p>
            <p className="text-xs text-subtle mt-3">
              {new Date(p.updatedAt).toLocaleString()}
            </p>
          </Link>
          <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={() => onRename(p.id, p.name)}
              className="p-1.5 rounded text-subtle hover:text-foreground hover:bg-surface"
              title="Rename"
            >
              <PencilIcon width={14} height={14} />
            </button>
            <button
              onClick={() =>
                setMoveMenuFor(moveMenuFor === p.id ? null : p.id)
              }
              className="p-1.5 rounded text-subtle hover:text-foreground hover:bg-surface"
              title="Move to subject"
            >
              <MoveIcon width={14} height={14} />
            </button>
            <button
              onClick={() => onDelete(p.id, p.name)}
              className="p-1.5 rounded text-subtle hover:text-red-400 hover:bg-surface"
              title="Delete"
            >
              <TrashIcon width={14} height={14} />
            </button>
          </div>
          {moveMenuFor === p.id && (
            <MoveMenu
              current={p.folder || ROOT_KEY}
              folders={folders}
              onPick={(folder) => onMove(p.id, folder)}
              onClose={() => setMoveMenuFor(null)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function MoveMenu({
  current,
  folders,
  onPick,
  onClose,
}: {
  current: string;
  folders: string[];
  onPick: (folder: string) => void;
  onClose: () => void;
}) {
  // Targets: root + every subject folder, minus the current one.
  const targets = [ROOT_KEY, ...folders].filter((f) => f !== current);
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute top-11 right-3 z-20 w-48 max-h-64 overflow-auto rounded-lg border border-border bg-panel shadow-xl py-1 text-sm">
        <p className="px-3 py-1 text-xs text-subtle">Move to…</p>
        {targets.length === 0 ? (
          <p className="px-3 py-1.5 text-subtle">No other subject.</p>
        ) : (
          targets.map((f) => (
            <button
              key={f || "(root)"}
              onClick={() => onPick(f)}
              className="w-full text-left px-3 py-1.5 hover:bg-surface flex items-center gap-2 truncate"
            >
              <FolderIcon width={13} height={13} className="text-muted shrink-0" />
              {f === ROOT_KEY ? "No subject" : f}
            </button>
          ))
        )}
      </div>
    </>
  );
}
