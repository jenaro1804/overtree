"use client";

import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";
import { ProjectCard } from "./project-card";
import {
  type Layout,
  type SortMode,
  type TreeNode,
  DEFAULT_SORT,
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
};

type Props = {
  node: TreeNode;
  depth: number;
  layout: Layout;
  folders: string[];
  collapsed: Set<string>;
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
  const [dropOver, setDropOver] = useState(false);

  // Keep latest handlers/path without re-registering the drop target each render.
  const dropRef = useRef({ path: node.path, onDropProject: handlers.onDropProject });
  dropRef.current = { path: node.path, onDropProject: handlers.onDropProject };

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "project",
      getData: () => ({ type: "subject", path: dropRef.current.path }),
      // Highlight only the innermost subject under the pointer (nested case).
      onDrag: ({ self, location }) =>
        setDropOver(location.current.dropTargets[0]?.element === self.element),
      onDragLeave: () => setDropOver(false),
      onDrop: ({ source, location, self }) => {
        setDropOver(false);
        if (location.current.dropTargets[0]?.element !== self.element) return;
        const data = source.data as { id?: string; folder?: string };
        const { path, onDropProject } = dropRef.current;
        if (data.id && data.folder !== path) onDropProject(data.id, path);
      },
    });
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{ marginLeft: depth * 16 }}
      className={`rounded-lg transition ${
        dropOver ? "ring-2 ring-accent bg-accent/5" : ""
      }`}
    >
      <div className="group/section flex items-center gap-2 mb-3">
        <button
          onClick={() => handlers.onToggle(node.path)}
          className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition min-w-0"
        >
          {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          <FolderIcon width={14} height={14} />
          <span className="truncate">
            {isRoot ? "No subject" : node.name}
          </span>
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
