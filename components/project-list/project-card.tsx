"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  FolderIcon,
  LockIcon,
  MoveIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";
import { type Project, ROOT_KEY } from "./tree";

type Props = {
  project: Project;
  folders: string[];
  /** Whether this card accepts reorder drops (off in the search view). */
  reorderable?: boolean;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, folder: string) => void;
  /** Drop a project before/after this one within the same subject → reorder. */
  onReorder: (
    folder: string,
    draggedId: string,
    targetId: string,
    edge: "left" | "right",
  ) => void;
};

export function ProjectCard({
  project: p,
  folders,
  reorderable = true,
  onDelete,
  onRename,
  onMove,
  onReorder,
}: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  // Latest props for the DnD callbacks without re-registering each render.
  const cur = useRef({ id: p.id, folder: p.folder || ROOT_KEY, onReorder });
  cur.current = { id: p.id, folder: p.folder || ROOT_KEY, onReorder };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cleanups = [
      draggable({
        element: el,
        getInitialData: () => ({
          type: "project",
          id: cur.current.id,
          folder: cur.current.folder,
        }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
    ];
    if (reorderable) {
      cleanups.push(
        dropTargetForElements({
          element: el,
          // Only a same-subject project reorders onto this card; cross-subject
          // drags fall through to the section (= move), and never onto itself.
          canDrop: ({ source }) =>
            source.data.type === "project" &&
            source.data.id !== cur.current.id &&
            source.data.folder === cur.current.folder,
          getData: ({ input, element }) =>
            attachClosestEdge(
              { type: "project-target", id: cur.current.id },
              { input, element, allowedEdges: ["left", "right"] },
            ),
          onDrag: ({ self, location }) =>
            setEdge(
              location.current.dropTargets[0]?.element === self.element
                ? extractClosestEdge(self.data)
                : null,
            ),
          onDragLeave: () => setEdge(null),
          onDrop: ({ source, self, location }) => {
            setEdge(null);
            if (location.current.dropTargets[0]?.element !== self.element) return;
            const e = extractClosestEdge(self.data);
            if (e === "left" || e === "right") {
              cur.current.onReorder(
                cur.current.folder,
                source.data.id as string,
                cur.current.id,
                e,
              );
            }
          },
        }),
      );
    }
    return combine(...cleanups);
  }, [reorderable]);

  return (
    <li
      ref={ref}
      className={`group relative border border-border rounded-xl p-5 bg-panel hover:border-border-strong transition cursor-grab active:cursor-grabbing ${
        dragging ? "opacity-40" : ""
      }`}
    >
      {edge === "left" && (
        <div className="pointer-events-none absolute top-2 bottom-2 -left-2 w-0.5 rounded bg-accent" />
      )}
      {edge === "right" && (
        <div className="pointer-events-none absolute top-2 bottom-2 -right-2 w-0.5 rounded bg-accent" />
      )}
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
