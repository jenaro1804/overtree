"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import type { CodeMirrorHandle, Peer } from "./yjs-code-mirror";
import { FileTree, type FileNode } from "@/components/file-tree/file-tree";
import { CheckIcon, LoaderIcon, PlayIcon, SaveIcon } from "@/components/icons";
import {
  CompileLog,
  type LogEntry,
} from "@/components/compile-log/compile-log";
import { PresenceBar } from "@/components/presence/presence-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareButton } from "./share-button";
import { useTheme } from "@/lib/theme";

const YjsCodeMirror = dynamic(
  () => import("./yjs-code-mirror").then((m) => m.YjsCodeMirror),
  { ssr: false, loading: () => <div className="h-full bg-background" /> },
);

import { PdfViewer } from "@/components/pdf-viewer/pdf-viewer";

type ProjectMeta = {
  id: string;
  name: string;
  mainFile: string;
  private: boolean;
};

type CompileStatus = "idle" | "running" | "ok" | "failed";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type UserInfo = { name: string; color: string };

export function EditorShell({
  project,
  user: initialUser,
}: {
  project: ProjectMeta;
  user: UserInfo;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [activePath, setActivePath] = useState<string>(project.mainFile);
  const [compileStatus, setCompileStatus] = useState<CompileStatus>("idle");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [pdfBust, setPdfBust] = useState(0);
  const [pdfAvailable, setPdfAvailable] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<UserInfo>(initialUser);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const { theme } = useTheme();

  const editorRef = useRef<CodeMirrorHandle | null>(null);
  const errorLinesRef = useRef<number[]>([]);
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const reloadTree = useCallback(async () => {
    const r = await fetch(`/api/files/${project.id}`);
    const j = await r.json();
    setTree(j.tree ?? []);
  }, [project.id]);

  useEffect(() => {
    reloadTree();
    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, [project.id, reloadTree]);

  const subscribeCompile = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    setLogEntries([]);
    errorLinesRef.current = [];
    editorRef.current?.clearErrorMarks();
    setCompileStatus("running");
    const es = new EventSource(`/api/compile/${project.id}`);
    sseRef.current = es;
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "log") {
        setLogEntries((prev) => [
          ...prev,
          { kind: "log", text: data.line, stream: data.stream },
        ]);
      } else if (data.type === "error") {
        setLogEntries((prev) => [
          ...prev,
          { kind: "error", line: data.line, text: data.message },
        ]);
        if (typeof data.line === "number" && data.line > 0) {
          errorLinesRef.current.push(data.line);
        }
      } else if (data.type === "done") {
        setCompileStatus(data.ok ? "ok" : "failed");
        editorRef.current?.markErrorLines(errorLinesRef.current);
        if (data.pdfPath) {
          setPdfAvailable(true);
          setPdfBust(Date.now());
        }
        es.close();
      } else if (data.type === "idle") {
        setCompileStatus("idle");
        es.close();
      }
    };
    es.onerror = () => {
      setCompileStatus("failed");
      es.close();
    };
  }, [project.id]);

  const compile = useCallback(async () => {
    await fetch(`/api/compile/${project.id}`, { method: "POST" });
    subscribeCompile();
  }, [project.id, subscribeCompile]);

  const saveNow = useCallback(async () => {
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    setSaveStatus("saving");
    try {
      const r = await fetch(`/api/save/${project.id}`, { method: "POST" });
      if (!r.ok) throw new Error(`save ${r.status}`);
      setSaveStatus("saved");
      savedFlashTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("error");
      savedFlashTimer.current = setTimeout(() => setSaveStatus("idle"), 2500);
    }
  }, [project.id]);

  function handleSaveNow() {
    // Ctrl-S: flush yjs to disk and queue a compile.
    saveNow();
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => compile(), 200);
  }

  useEffect(() => {
    return () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    };
  }, []);

  async function createFile(parent: string) {
    const name = prompt(
      `New file name${parent ? ` inside "${parent}"` : ""}:`,
      "untitled.tex",
    );
    if (!name) return;
    const path = parent ? `${parent}/${name}` : name;
    const r = await fetch(`/api/files/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "create", path, content: "" }),
    });
    if (r.ok) {
      await reloadTree();
      setActivePath(path);
    }
  }

  async function uploadFiles(parent: string, files: FileList) {
    for (const file of Array.from(files)) {
      const filePath = parent ? `${parent}/${file.name}` : file.name;
      const buffer = await file.arrayBuffer();
      await fetch(`/api/files/${project.id}/${filePath}`, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: buffer,
      });
    }
    await reloadTree();
  }

  async function deletePath(path: string) {
    if (!confirm(`Delete "${path}"?`)) return;
    await fetch(`/api/files/${project.id}/${encodeURI(path)}`, {
      method: "DELETE",
    });
    if (activePath === path) setActivePath(project.mainFile);
    reloadTree();
  }

  function jumpToLine(line: number) {
    editorRef.current?.gotoLine(line);
  }

  async function changeName() {
    const next = window.prompt("Your name:", user.name);
    if (!next || !next.trim()) return;
    const trimmed = next.trim();
    await fetch("/api/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setUser({ ...user, name: trimmed });
  }

  const pdfSrc = pdfAvailable
    ? `/api/pdf/${project.id}?v=${pdfBust}`
    : null;

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-panel">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/projects"
            className="text-muted hover:text-foreground text-sm shrink-0"
          >
            ← Projects
          </Link>
          <span className="text-subtle shrink-0">/</span>
          <span className="font-medium truncate">{project.name}</span>
          <span className="text-xs text-muted truncate">{activePath}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={changeName}
            className="text-xs text-muted hover:text-foreground"
            title="Change name"
          >
            {user.name}
          </button>
          <PresenceBar me={user} peers={peers} connected={connected} />
          <ThemeToggle />
          <ShareButton projectId={project.id} isPrivate={project.private} />
          <button
            onClick={saveNow}
            disabled={saveStatus === "saving"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-strong hover:border-border-strong hover:bg-surface disabled:opacity-50 text-foreground text-sm font-medium transition"
            title="Save (Ctrl+S)"
          >
            {saveStatus === "saving" ? (
              <LoaderIcon width={12} height={12} />
            ) : saveStatus === "saved" ? (
              <CheckIcon width={12} height={12} />
            ) : (
              <SaveIcon width={12} height={12} />
            )}
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "saved"
                ? "Saved"
                : saveStatus === "error"
                  ? "Error"
                  : "Save"}
          </button>
          <button
            onClick={compile}
            disabled={compileStatus === "running"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition"
            title="Compile (Ctrl+Enter)"
          >
            {compileStatus === "running" ? (
              <LoaderIcon width={12} height={12} />
            ) : (
              <PlayIcon width={12} height={12} />
            )}
            {compileStatus === "running" ? "Compiling…" : "Compile"}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <PanelGroup orientation="horizontal" className="h-full">
          <Panel defaultSize={18} minSize={12}>
            <FileTree
              tree={tree}
              activePath={activePath}
              onOpen={setActivePath}
              onCreate={createFile}
              onDelete={deletePath}
              onUpload={uploadFiles}
            />
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-border-strong transition" />
          <Panel defaultSize={45} minSize={20}>
            <PanelGroup orientation="vertical" className="h-full">
              <Panel defaultSize={70} minSize={20}>
                <div className="h-full bg-background">
                  <YjsCodeMirror
                    projectId={project.id}
                    path={activePath}
                    userName={user.name}
                    userColor={user.color}
                    theme={theme}
                    onSave={handleSaveNow}
                    onCompile={compile}
                    onPeers={setPeers}
                    onConnectionChange={setConnected}
                    onReady={(h) => {
                      editorRef.current = h;
                    }}
                  />
                </div>
              </Panel>
              <PanelResizeHandle className="h-px bg-border hover:bg-border-strong transition" />
              <Panel defaultSize={30} minSize={10}>
                <CompileLog
                  entries={logEntries}
                  status={compileStatus}
                  onJumpToLine={jumpToLine}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-border-strong transition" />
          <Panel defaultSize={37} minSize={20}>
            <PdfViewer src={pdfSrc} />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
