"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type LogEntry = {
  kind: "log" | "error";
  line?: number;
  text: string;
  stream?: "stdout" | "stderr";
};

type Props = {
  entries: LogEntry[];
  status: "idle" | "running" | "ok" | "failed";
  onJumpToLine: (line: number) => void;
};

export function CompileLog({ entries, status, onJumpToLine }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-t border-zinc-800 text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
        <span className="text-zinc-500 uppercase tracking-wide">Log</span>
        <StatusPill status={status} />
      </div>
      <div
        ref={ref}
        className="flex-1 overflow-auto scrollbar-thin font-mono p-2 space-y-0.5"
      >
        {entries.length === 0 && (
          <p className="text-zinc-600">
            Compile output will appear here. Press Compile or Cmd+Enter.
          </p>
        )}
        {entries.map((e, i) => {
          if (e.kind === "error") {
            return (
              <div
                key={i}
                onClick={() => e.line && onJumpToLine(e.line)}
                className="cursor-pointer text-red-400 hover:bg-red-950/40 px-2 py-0.5 rounded"
              >
                {e.line ? <span className="opacity-60">l.{e.line} </span> : null}
                {e.text}
              </div>
            );
          }
          return (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-all px-2",
                e.stream === "stderr" ? "text-amber-300/90" : "text-zinc-300",
              )}
            >
              {e.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Props["status"] }) {
  if (status === "running")
    return <span className="text-blue-400">compiling…</span>;
  if (status === "ok")
    return <span className="text-emerald-400">ok</span>;
  if (status === "failed")
    return <span className="text-red-400">failed</span>;
  return null;
}
