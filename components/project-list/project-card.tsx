"use client";

import Link from "next/link";
import { type DragEvent, useState } from "react";
import {
  FolderIcon,
  LockIcon,
  MoveIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";
import { DRAG_PROJECT_MIME, type Project, ROOT_KEY } from "./tree";

type Props = {
  project: Project;
  folders: string[];
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, folder: string) => void;
};

export function ProjectCard({
  project: p,
  folders,
  onDelete,
  onRename,
  onMove,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  function handleDragStart(e: DragEvent<HTMLLIElement>) {
    e.dataTransfer.setData(
      DRAG_PROJECT_MIME,
      JSON.stringify({ id: p.id, folder: p.folder || ROOT_KEY }),
    );
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }

  return (
    <li
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      className={`group relative border border-border rounded-xl p-5 bg-panel hover:border-border-strong transition cursor-grab active:cursor-grabbing ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <Link href={`/projects/${p.id}`} draggable={false} className="block">
        <div className="flex items-center gap-2 mb-3 text-muted">
          <FolderIcon />
          {p.private && (
            <LockIcon width={12} height={12} className="text-amber-500" />
          )}
        </div>
        <h3 className="font-medium truncate pr-20">{p.name}</h3>
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
          onClick={() => setMenuOpen((v) => !v)}
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
      {menuOpen && (
        <MoveMenu
          current={p.folder || ROOT_KEY}
          folders={folders}
          onPick={(folder) => {
            setMenuOpen(false);
            onMove(p.id, folder);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </li>
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
  const targets = [ROOT_KEY, ...folders].filter((f) => f !== current);
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute top-11 right-3 z-20 w-56 max-h-64 overflow-auto rounded-lg border border-border bg-panel shadow-xl py-1 text-sm">
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
