# Overtree

Local-first LaTeX editor with LAN collaboration and an MCP server. Like Overleaf
but everything lives on your machine — projects are real folders, the compiler
runs locally, and people on your network edit together in real time.

## Highlights

- **Open in any browser** on your LAN — share the URL, anyone with the password
  joins and edits live.
- **Real-time multicursor** powered by Yjs CRDTs (`y-codemirror.next`).
- **CodeMirror 6** with LaTeX (`stex`) syntax highlighting.
- **One-click compile** with [Tectonic](https://tectonic-typesetting.github.io/),
  PDF preview rendered with `pdf.js`.
- **MCP server** so Claude Desktop, ChatGPT Desktop, and Claude Code can read,
  edit, and compile your projects directly. Edits land live in connected editors.
- **Per-project name + password** for private projects; public projects only ask
  for a display name.
- **Templates**: article, beamer, report, letter, ieee, blank. Drop your own
  folder into `templates/` and it shows up automatically (no code changes).

## Setup — Windows (from scratch)

Everything is auto-detected per machine — **there is nothing to hand-edit after
cloning**. Just install the prerequisites and run.

### Prerequisites

```powershell
# Node.js LTS (gives you `node`, `npm`, `npx`) and Git, via winget:
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

> After a winget install, **open a new terminal** (or the new PATH won't be
> visible). Verify with `node --version` and `git --version`.

> **Bun is NOT required.** This project runs on Node + `tsx` via `npm`. The
> `bun.lock` file in the repo is ignored; `package-lock.json` is the lockfile.

### Install & run

```powershell
# 1. Clone — to a path WITHOUT "!" or special chars (see caveat below).
git clone <repo-url> overtree
cd overtree

# 2. Install Tectonic (LaTeX engine — NOT on winget, grab the GitHub release).
#    Download the latest x86_64-pc-windows-msvc.zip from
#    https://github.com/tectonic-typesetting/tectonic/releases/latest
#    then extract tectonic.exe to a folder and add it to your user PATH:
$dest = "$env:LOCALAPPDATA\Programs\Tectonic"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
# (extract tectonic.exe into $dest first, then:)
[Environment]::SetEnvironmentVariable(
  'Path',
  ([Environment]::GetEnvironmentVariable('Path','User').TrimEnd(';') + ';' + $dest),
  'User')
# Open a NEW terminal after this so `tectonic` is on PATH.

# 3. Install JS deps and run.
npm install
npm run dev
```

> **Clone path caveat:** the repo path must **not** contain `!` or other special
> characters. webpack treats `!` as loader syntax and the build breaks (e.g.
> `C:\Users\you\!projects\overtree` fails; `C:\overtree` or
> `C:\Users\you\code\overtree` are fine). Junctions don't help — Node resolves
> the real path.

The console prints your LAN URL, e.g. `http://192.168.1.42:3000`. Open it in any
browser. Anyone on the same network can use the same URL.

> Run `npm run doctor` anytime to check that Tectonic, settings, and your LAN IP
> are all detected.

> Make sure Windows Defender Firewall allows incoming connections on the chosen
> port (Settings → Network & internet → Windows Firewall → Allow an app through
> firewall, enable Node.js for private networks).

> If `tectonic` is installed but not on PATH, set
> `tectonicPath` in `~/.overtree/settings.json` to its full path
> (e.g. `C:\\Tools\\tectonic.exe`).

## Where do my files live?

Source files stay in your projects directory (`rootDir`, default
`~/Documents/Overtree/projects`). **Regenerable** files — the Yjs CRDT state and
the compile output — live in a per-machine cache under `%LOCALAPPDATA%` and are
**never** written into the project folder:

```
<rootDir>/<project-uuid>/          ← source: small, sync-friendly (OneDrive, git…)
├── main.tex
├── refs.bib
└── .overtree/project.json         ← project metadata (name, template, password)

%LOCALAPPDATA%/Overtree/cache/<project-uuid>/   ← regenerable, NOT synced
├── yjs/<base64>.bin               ← CRDT state (rewritten ~every 300ms while editing)
└── output/main.pdf, main.log…     ← compiler output (rewritten on every compile)
```

This split keeps the project folder tiny and stable — ideal for syncing it via
OneDrive or `git` without churn from the constantly-rewritten `.bin`/PDF. The
cache rebuilds itself from source on demand, so it's safe to delete; nothing in
it is irreplaceable (only cross-session undo history). The PDF is served to the
browser/MCP from the cache via `/api/pdf/<id>`.

Each project is a normal folder — `git init` inside it, back it up, copy it
elsewhere; the source is all regular files.

## Connecting AI clients (MCP)

After starting the dev server, open <http://localhost:3000/settings> for
copy-pasteable snippets, or run:

```powershell
npm run mcp-config
```

Three transports are supported simultaneously:

| Client            | Transport     | How                                                                                   |
| ----------------- | ------------- | ------------------------------------------------------------------------------------- |
| Claude Desktop    | stdio         | Paste the JSON block from `/settings` into the config file (see path note) and restart from tray. |
| Claude Code CLI   | stdio         | Copy the one-line command from `/settings` (it has the absolute path for this machine). |
| ChatGPT Desktop   | HTTP / SSE    | Add `http://<lan-ip>:3000/api/mcp` as a connector.                                   |

### Claude Desktop config — Windows gotchas

**Don't hand-write the snippet — copy it from `/settings`**, which fills in the
absolute paths for the machine you're on. The config file path depends on the build:

- **Classic installer (.exe)** → `%APPDATA%\Claude\claude_desktop_config.json`
- **Microsoft Store / MSIX build** → `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json`.
  The classic path will exist but is **ignored** by this build.

Easiest: inside Claude Desktop, **Settings → Developer → Edit config** opens the
right file for your build automatically. Paste under `mcpServers`.

The generated block looks like this (paths will match your machine — do not copy
these literally):

```json
{
  "mcpServers": {
    "overtree": {
      "command": "<...>\\nodejs\\npx.cmd",
      "args": ["-y", "tsx", "<repo>\\mcp-server\\stdio.ts"],
      "cwd": "<repo>",
      "env": { "TSX_TSCONFIG_PATH": "<repo>\\tsconfig.json" }
    }
  }
}
```

Why each piece matters (the `/settings` generator handles all of this for you):
- Absolute `npx.cmd` — the MSIX sandbox does not inherit user PATH, so bare `npx` fails silently.
- `cwd` + `TSX_TSCONFIG_PATH` — tsx needs to find `tsconfig.json` to resolve the `@/*` alias used in `lib/mcp/server.ts`. Without these the log shows `Cannot find module '@/lib/core/projects'` and the server disconnects immediately.
- Restart Claude Desktop fully (Quit from the system tray, not just close the window) after editing.

Tools exposed: `list_projects`, `create_project`, `delete_project`,
`list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`,
`compile`, `get_compile_log`, `get_pdf`, `get_project_info`, `list_templates`.

When the dev server is running and an editor is open, AI edits show up live
in connected browsers via Yjs (the file watcher reflects disk changes back into
the shared CRDT).

## Keyboard

- **Ctrl+S** — save (Yjs flushes automatically; this is a manual nudge that
  also schedules a compile)
- **Ctrl+Enter** — compile
- **Ctrl+Z / Ctrl+Shift+Z** — undo / redo (Yjs collaborative undo)

## Diagnostics

```powershell
npm run doctor   # checks tectonic, settings, LAN IPs
```

## Configuration

`~/.overtree/settings.json` is created on first launch:

```json
{
  "rootDir": "~/Documents/Overtree/projects",
  "port": 3000,
  "defaultEngine": "tectonic",
  "sessionSecret": "..."
}
```

Edit and restart to take effect. You can override the port at boot (PowerShell):
`$env:PORT=4040; npm run dev`.

## Out of v1 scope

- SyncTeX (PDF ↔ source clicking)
- Bibliography manager with CrossRef search
- Git integration UI
- Inline review comments
- Spell-check
- Word export

## Stack

Next.js 16 (App Router) · React 19 · CodeMirror 6 · Yjs · `y-websocket`
(server protocol implemented inline using `y-protocols`) · Tectonic ·
`@modelcontextprotocol/sdk` · iron-session · bcrypt · Node + tsx runtime.
