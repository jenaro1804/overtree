"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

export type FileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
  children?: FileNode[];
};

type Props = {
  tree: FileNode[];
  activePath?: string;
  onOpen: (path: string) => void;
  onCreate: (parent: string) => void;
  onDelete: (path: string) => void;
};

export function FileTree({
  tree,
  activePath,
  onOpen,
  onCreate,
  onDelete,
}: Props) {
  return (
    <div className="h-full flex flex-col bg-[var(--panel)] text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Files
        </span>
        <button
          onClick={() => onCreate("")}
          title="New file at root"
          className="text-zinc-500 hover:text-zinc-200"
        >
          <PlusIcon width={14} height={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin py-1">
        {tree.map((n) => (
          <Node
            key={n.path}
            node={n}
            depth={0}
            activePath={activePath}
            onOpen={onOpen}
            onCreate={onCreate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function Node({
  node,
  depth,
  activePath,
  onOpen,
  onCreate,
  onDelete,
}: {
  node: FileNode;
  depth: number;
  activePath?: string;
  onOpen: (p: string) => void;
  onCreate: (p: string) => void;
  onDelete: (p: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: 8 + depth * 12 };
  const isActive = node.path === activePath;

  if (node.kind === "dir") {
    return (
      <div>
        <div
          style={indent}
          className="group flex items-center gap-1 pr-2 py-1 hover:bg-zinc-900 cursor-pointer"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />}
          <FolderIcon width={14} height={14} className="text-amber-400/80" />
          <span className="truncate flex-1">{node.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreate(node.path);
            }}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200"
            title="New file in this folder"
          >
            <PlusIcon width={12} height={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.path);
            }}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
            title="Delete folder"
          >
            <TrashIcon width={12} height={12} />
          </button>
        </div>
        {open &&
          (node.children ?? []).map((c) => (
            <Node
              key={c.path}
              node={c}
              depth={depth + 1}
              activePath={activePath}
              onOpen={onOpen}
              onCreate={onCreate}
              onDelete={onDelete}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      style={indent}
      onClick={() => onOpen(node.path)}
      className={cn(
        "group flex items-center gap-1 pr-2 py-1 cursor-pointer",
        isActive ? "bg-zinc-800 text-white" : "hover:bg-zinc-900",
      )}
    >
      <span className="w-3" />
      <FileIcon width={14} height={14} className="text-zinc-500" />
      <span className="truncate flex-1">{node.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node.path);
        }}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"
        title="Delete"
      >
        <TrashIcon width={12} height={12} />
      </button>
    </div>
  );
}
