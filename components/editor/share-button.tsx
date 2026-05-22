"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ShareIcon } from "@/components/icons";

type SystemInfo = { ips: string[]; port: number };

type Props = {
  projectId: string;
  isPrivate: boolean;
};

/** Copy text to clipboard, with a fallback for insecure (LAN/http) contexts
 *  where navigator.clipboard is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ShareButton({ projectId, isPrivate }: Props) {
  const [open, setOpen] = useState(false);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/system")
      .then((r) => r.json())
      .then((j) => setSys({ ips: j.ips ?? [], port: j.port }))
      .catch(() => setSys({ ips: [], port: 3000 }));
  }, []);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function copy(key: string, value: string) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(key);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1500);
  }

  const hosts = sys ? (sys.ips.length ? sys.ips : ["localhost"]) : [];
  const port = sys?.port ?? 3000;

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-strong hover:bg-surface text-foreground text-sm font-medium transition"
        title="Share session"
      >
        <ShareIcon width={12} height={12} /> Share
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-panel border border-border rounded-lg shadow-2xl p-3 z-50 text-sm">
          <p className="font-medium mb-1">Share session</p>
          <p className="text-xs text-muted mb-3">
            Anyone on the same Wi-Fi network can open this link and join.
          </p>

          {!sys ? (
            <p className="text-muted text-xs">Loading…</p>
          ) : sys.ips.length === 0 ? (
            <p className="text-amber-400 text-xs">
              No local network IP detected. Connect to Wi-Fi/Ethernet to share
              over LAN.
            </p>
          ) : (
            <div className="space-y-2">
              {hosts.map((host) => {
                const url = `http://${host}:${port}/projects/${projectId}`;
                const ipPort = `${host}:${port}`;
                return (
                  <div
                    key={host}
                    className="border border-border rounded-md p-2 space-y-1.5"
                  >
                    <code className="block text-xs text-foreground break-all">
                      {url}
                    </code>
                    <div className="flex gap-1.5">
                      <CopyChip
                        label="Copy link"
                        copied={copied === `link:${host}`}
                        onClick={() => copy(`link:${host}`, url)}
                      />
                      <CopyChip
                        label="Copy IP"
                        copied={copied === `ip:${host}`}
                        onClick={() => copy(`ip:${host}`, ipPort)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isPrivate && (
            <p className="text-xs text-muted mt-3 border-t border-border pt-2">
              🔒 Private project: also share the password so they can get in.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyChip({
  label,
  copied,
  onClick,
}: {
  label: string;
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-surface text-muted hover:text-foreground transition"
    >
      {copied ? (
        <>
          <CheckIcon width={11} height={11} /> Copied
        </>
      ) : (
        label
      )}
    </button>
  );
}
