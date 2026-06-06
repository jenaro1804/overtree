"use client";

import { useEffect, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  GripIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";
import { ProjectCard } from "./project-card";
import {
  type Layout,
  type SortMode,
  type TreeNode,
  DEFAULT_SORT,
  parentFolder,
  SORT_LABELS,
  sortProjects,
} from "./tree";

export type SubjectHandlers = {
  onToggle: (path: string) => void;
  onChangeSort: (folder: string, mode: SortMode) => void;
  onAddSub: (parent: string) => void;
  onRenameSubject: (path: string) => void;
  onDeleteSubject: (path: string) => void;
  onDeleteProject: (id: string, name: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onMoveProject: (id: string, folder: string) => void;
  /** A project card was dropped onto this subject (folder = target path). */
  onDropProject: (id: string, folder: string) => void;
  /** A subject was dropped above/below a sibling → reorder. */
  onReorderSubject: (dragged: string, target: string, edge: "top" | "bottom") => void;
  /** A project was dropped before/after another within the same subject → reorder. */
  onReorderProject: (
    folder: string,
    draggedId: string,
    targetId: string,
    edge: "left" | "right",
  ) => void;
};

type Props = {
  node: TreeNode;
  depth: number;
  layout: Layout;
  folders: string[];
  collapsed: Set<string>;
  flashPath?: string;
  isRoot?: boolean;
  handlers: SubjectHandlers;
};

const SORT_OPTIONS: SortMode[] = ["alphabetical", "updated", "custom"];

export function SubjectSection({
  node,
  depth,
  layout,
  folders,
  collapsed,
  flashPath,
  isRoot,
  handlers,
}: Props) {
  const isCollapsed = collapsed.has(node.path);
  const mode = layout.sort[node.path] ?? DEFAULT_SORT;
  const ordered = sortProjects(
    node.projects,
    mode,
    layout.projectOrder[node.path] ?? [],
  );
  const total = node.projects.length;

  const sectionRef = useRef<HTMLElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const [dropOver, setDropOver] = useState(false); // project drag → ring
  const [edge, setEdge] = useState<Edge | null>(null); // subject drag → drop line
  const [dragging, setDragging] = useState(false); // this subject is being dragged

  // Latest path/handlers without re-registering DnD on every render.
  const ref = useRef({
    path: node.path,
    onDropProject: handlers.onDropProject,
    onReorderSubject: handlers.onReorderSubject,
  });
  ref.current = {
    path: node.path,
    onDropProject: handlers.onDropProject,
    onReorderSubject: handlers.onReorderSubject,
  };

  // Drag handle: lets you grab a subject by its grip to reorder it.
  useEffect(() => {
    const el = gripRef.current;
    if (!el || isRoot) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: "subject", path: ref.current.path }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [isRoot]);

  // Drop target: accepts project cards (move) AND sibling subjects (reorder).
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        if (source.data.type === "project") return true;
        if (source.data.type === "subject" && !isRoot) {
          const p = source.data.path as string;
          return (
            p !== ref.current.path &&
            parentFolder(p) === parentFolder(ref.current.path)
          );
        }
        return false;
      },
      getData: ({ input, element }) =>
        attachClosestEdge(
          { type: "subject-target", path: ref.current.path },
          { input, element, allowedEdges: ["top", "bottom"] },
        ),
      onDrag: ({ source, self, location }) => {
        const innermost =
          location.current.dropTargets[0]?.element === self.element;
        if (source.data.type === "project") {
          setDropOver(innermost);
          setEdge(null);
        } else {
          setDropOver(false);
          setEdge(innermost ? extractClosestEdge(self.data) : null);
        }
      },
      onDragLeave: () => {
        setDropOver(false);
        setEdge(null);
      },
      onDrop: ({ source, self, location }) => {
        setDropOver(false);
        setEdge(null);
        if (location.current.dropTargets[0]?.element !== self.element) return;
        const { path, onDropProject, onReorderSubject } = ref.current;
        if (source.data.type === "project") {
          const data = source.data as { id?: string; folder?: string };
          if (data.id && data.folder !== path) onDropProject(data.id, path);
        } else if (source.data.type === "subject") {
          const e = extractClosestEdge(self.data);
          if (e === "top" || e === "bottom") {
            onReorderSubject(source.data.path as string, path, e);
          }
        }
      },
    });
  }, [isRoot]);

  return (
    <section
      ref={sectionRef}
      style={{ marginLeft: depth * 16 }}
      className={`relative rounded-lg transition ${
        dropOver ? "ring-2 ring-accent bg-accent/5" : ""
      } ${dragging ? "opacity-40" : ""} ${
        flashPath === node.path ? "subject-flash" : ""
      }`}
    >
      {edge === "top" && (
        <div className="pointer-events-none absolute left-0 right-0 -top-1 h-0.5 rounded bg-accent" />
      )}
      {edge === "bottom" && (
        <div className="pointer-events-none absolute left-0 right-0 -bottom-1 h-0.5 rounded bg-accent" />
      )}

      <div className="group/section flex items-center gap-1 mb-3">
        {!isRoot && (
          <button
            ref={gripRef}
            className="cursor-grab active:cursor-grabbing p-0.5 text-subtle hover:text-foreground opacity-0 group-hover/section:opacity-100 transition"
            title="Drag to reorder"
            aria-label="Drag to reorder subject"
          >
            <GripIcon width={14} height={14} />
          </button>
        )}
        <button
          onClick={() => handlers.onToggle(node.path)}
          className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition min-w-0"
        >
          {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          <FolderIcon width={14} height={14} />
          <span className="truncate">{isRoot ? "No subject" : node.name}</span>
          <span className="text-subtle font-normal">({total})</span>
        </button>

        {total > 1 && (
          <select
            value={mode}
            onChange={(e) =>
              handlers.onChangeSort(node.path, e.target.value as SortMode)
            }
            className="ml-1 bg-background border border-border rounded px-1.5 py-0.5 text-xs text-muted"
            title="Sort projects"
          >
            {SORT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {SORT_LABELS[m]}
              </option>
            ))}
          </select>
        )}

        {!isRoot && (
          <div className="flex items-center gap-1 opacity-0 group-hover/section:opacity-100 transition">
            <button
              onClick={() => handlers.onAddSub(node.path)}
              className="p-1 rounded text-subtle hover:text-foreground hover:bg-surface"
              title="New sub-subject"
            >
              <FolderPlusIcon width={13} height={13} />
            </button>
            <button
              onClick={() => handlers.onRenameSubject(node.path)}
              className="p-1 rounded text-subtle hover:text-foreground hover:bg-surface"
              title="Rename subject"
            >
              <PencilIcon width={13} height={13} />
            </button>
            <button
              onClick={() => handlers.onDeleteSubject(node.path)}
              className="p-1 rounded text-subtle hover:text-red-400 hover:bg-surface"
              title="Delete subject (must be empty)"
            >
              <TrashIcon width={13} height={13} />
            </button>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="space-y-6">
          {ordered.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ordered.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  folders={folders}
                  onDelete={handlers.onDeleteProject}
                  onRename={handlers.onRenameProject}
                  onMove={handlers.onMoveProject}
                  onReorder={handlers.onReorderProject}
                />
              ))}
            </ul>
          )}
          {/* Root's children are rendered as top-level siblings by the parent. */}
          {!isRoot &&
            node.children.map((child) => (
              <SubjectSection
                key={child.path}
                node={child}
                depth={depth + 1}
                layout={layout}
                folders={folders}
                collapsed={collapsed}
                flashPath={flashPath}
                handlers={handlers}
              />
            ))}
          {!isRoot && ordered.length === 0 && node.children.length === 0 && (
            <p className="text-sm text-subtle pl-6">Empty subject.</p>
          )}
        </div>
      )}
    </section>
  );
}
