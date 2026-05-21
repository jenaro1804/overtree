"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type System = {
  rootDir: string;
  port: number;
  ips: string[];
  lanUrl: string;
  tectonicAvailable: boolean;
  mcpStdioBin: string;
  mcpCommand: string;
  mcpCwd: string;
  mcpTsconfig: string;
  mcpHttpUrl: string;
};

export function SettingsView() {
  const [sys, setSys] = useState<System | null>(null);

  useEffect(() => {
    fetch("/api/system")
      .then((r) => r.json())
      .then(setSys);
  }, []);

  if (!sys) {
    return <div className="p-12 text-zinc-500">Loading…</div>;
  }

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        overtree: {
          command: sys.mcpCommand,
          args: ["-y", "tsx", sys.mcpStdioBin],
          cwd: sys.mcpCwd,
          env: { TSX_TSCONFIG_PATH: sys.mcpTsconfig },
        },
      },
    },
    null,
    2,
  );
  const claudeCodeCmd = `claude mcp add overtree -- npx -y tsx "${sys.mcpStdioBin}"`;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/projects"
            className="text-zinc-400 hover:text-zinc-100 text-sm"
          >
            ← Projects
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Settings</h1>
        </div>
      </header>

      <Section title="System">
        <Row label="Projects directory" value={sys.rootDir} />
        <Row label="Server port" value={String(sys.port)} />
        <Row
          label="LAN address"
          value={
            <div className="space-y-0.5">
              {sys.ips.length === 0 ? (
                <span className="text-zinc-500">No external interfaces</span>
              ) : (
                sys.ips.map((ip) => (
                  <code key={ip} className="text-emerald-400 block">
                    http://{ip}:{sys.port}
                  </code>
                ))
              )}
            </div>
          }
        />
        <Row
          label="Tectonic (LaTeX engine)"
          value={
            sys.tectonicAvailable ? (
              <span className="text-emerald-400">installed</span>
            ) : (
              <span className="text-amber-400">
                not found — download the{" "}
                <code className="bg-zinc-900 px-1 rounded">
                  x86_64-pc-windows-msvc
                </code>{" "}
                zip from{" "}
                <a
                  href="https://github.com/tectonic-typesetting/tectonic/releases/latest"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-amber-300"
                >
                  tectonic releases
                </a>
                , extract <code className="bg-zinc-900 px-1 rounded">tectonic.exe</code>{" "}
                to a folder on your PATH (or set{" "}
                <code className="bg-zinc-900 px-1 rounded">settings.tectonicPath</code>)
              </span>
            )
          }
        />
      </Section>

      <Section title="Claude Desktop (stdio)">
        <p className="text-sm text-zinc-400 mb-3">
          In Claude Desktop open{" "}
          <strong className="text-zinc-200">
            Settings → Developer → Edit config
          </strong>{" "}
          (it opens the right file for your build), paste the snippet below into{" "}
          <code className="bg-zinc-900 px-1 rounded">mcpServers</code>, then{" "}
          <strong className="text-zinc-200">quit Claude Desktop from the tray</strong>{" "}
          and reopen it. The paths below are already filled in for this machine.
        </p>
        <CodeBlock value={claudeConfig} />
      </Section>

      <Section title="Claude Code CLI (stdio)">
        <p className="text-sm text-zinc-400 mb-3">
          Run once in your terminal:
        </p>
        <CodeBlock value={claudeCodeCmd} />
      </Section>

      <Section title="ChatGPT Desktop / HTTP clients">
        <p className="text-sm text-zinc-400 mb-3">
          In ChatGPT Desktop → Settings → Connectors → Add MCP server, paste:
        </p>
        <CodeBlock value={sys.mcpHttpUrl} />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">
        {title}
      </h2>
      <div className="bg-[var(--panel)] border border-zinc-800 rounded-xl p-4 space-y-3">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-start text-sm">
      <span className="text-zinc-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 border border-zinc-800 rounded-md p-3 text-xs overflow-auto scrollbar-thin">
        <code className="font-mono text-zinc-200">{value}</code>
      </pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
