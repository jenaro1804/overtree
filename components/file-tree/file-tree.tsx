"use client";

import { useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
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
  onUpload: (parent: string, files: FileList) => void;
};

export function FileTree({
  tree,
  activePath,
  onOpen,
  onCreate,
  onDelete,
  onUpload,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "h-full flex flex-col bg-panel text-sm relative",
        isDragOver && "ring-2 ring-inset ring-blue-500",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as HTMLElement)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length > 0) {
          onUpload("", e.dataTransfer.files);
        }
      }}
    >
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center pointer-events-none z-10">
          <span className="text-blue-400 text-xs font-medium">Drop files here</span>
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs uppercase tracking-wide text-muted">
          Files
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => inputRef.current?.click()}
            title="Upload files"
            className="text-muted hover:text-foreground"
          >
            <UploadIcon width={14} height={14} />
          </button>
          <button
            onClick={() => onCreate("")}
            title="New file at root"
            className="text-muted hover:text-foreground"
          >
            <PlusIcon width={14} height={14} />
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            onUpload("", e.target.files);
            e.target.value = "";
          }
        }}
      />
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
            onUpload={onUpload}
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
  onUpload,
}: {
  node: FileNode;
  depth: number;
  activePath?: string;
  onOpen: (p: string) => void;
  onCreate: (p: string) => void;
  onDelete: (p: string) => void;
  onUpload: (p: string, files: FileList) => void;
}) {
  const [open, setOpen] = useState(true);
  const [isDirDragOver, setIsDirDragOver] = useState(false);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const indent = { paddingLeft: 8 + depth * 12 };
  const isActive = node.path === activePath;

  if (node.kind === "dir") {
    return (
      <div>
        <div
          style={indent}
          className={cn(
            "group flex items-center gap-1 pr-2 py-1 cursor-pointer",
            isDirDragOver ? "bg-blue-500/20" : "hover:bg-surface",
          )}
          onClick={() => setOpen((v) => !v)}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDirDragOver(true);
          }}
          onDragLeave={() => setIsDirDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDirDragOver(false);
            if (e.dataTransfer.files.length > 0) {
              onUpload(node.path, e.dataTransfer.files);
            }
          }}
        >
          {open ? (
            <ChevronDownIcon width={12} height={12} />
          ) : (
            <ChevronRightIcon width={12} height={12} />
          )}
          <FolderIcon width={14} height={14} className="text-amber-400/80" />
          <span className="truncate flex-1">{node.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dirInputRef.current?.click();
            }}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground"
            title="Upload files to this folder"
          >
            <UploadIcon width={12} height={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreate(node.path);
            }}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground"
            title="New file in this folder"
          >
            <PlusIcon width={12} height={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.path);
            }}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400"
            title="Delete folder"
          >
            <TrashIcon width={12} height={12} />
          </button>
          <input
            ref={dirInputRef}
            type="file"
            multiple
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.files?.length) {
                onUpload(node.path, e.target.files);
                e.target.value = "";
              }
            }}
          />
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
              onUpload={onUpload}
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
        isActive ? "bg-surface text-foreground" : "hover:bg-surface",
      )}
    >
      <span className="w-3" />
      <FileIcon width={14} height={14} className="text-muted" />
      <span className="truncate flex-1">{node.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node.path);
        }}
        className="opacity-0 group-hover:opacity-100 text-subtle hover:text-red-400"
        title="Delete"
      >
        <TrashIcon width={12} height={12} />
      </button>
    </div>
  );
}
