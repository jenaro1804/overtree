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
- **Templates**: article, beamer, report, letter, ieee, blank.

## Setup (3 steps)

```bash
# 1. Install Tectonic (LaTeX engine)
brew install tectonic

# 2. Install JS deps
bun install

# 3. Run
bun run dev
```

The console prints your LAN URL, e.g. `http://192.168.1.42:3000`. Open it in any
browser. Anyone on the same network can use the same URL.

> Make sure macOS firewall allows incoming connections on the chosen port
> (System Settings → Network → Firewall).

## Where do my files live?

```
~/Documents/Overtree/projects/
└── <project-uuid>/
    ├── main.tex
    ├── refs.bib
    ├── output/main.pdf
    └── .overtree/project.json
```

Each project is a normal folder. You can `git init` inside it, back it up,
copy it elsewhere — everything is a regular file.

## Connecting AI clients (MCP)

After starting the dev server, open <http://localhost:3000/settings> for
copy-pasteable snippets, or run:

```bash
bun run mcp-config
```

Three transports are supported simultaneously:

| Client            | Transport     | How                                                                                   |
| ----------------- | ------------- | ------------------------------------------------------------------------------------- |
| Claude Desktop    | stdio         | Paste the JSON snippet into `~/Library/Application Support/Claude/claude_desktop_config.json` and restart. |
| Claude Code CLI   | stdio         | `claude mcp add overtree -- bun /path/to/mcp-server/stdio.ts`                         |
| ChatGPT Desktop   | HTTP / SSE    | Add `http://<lan-ip>:3000/api/mcp` as a connector.                                   |

Tools exposed: `list_projects`, `create_project`, `delete_project`,
`list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`,
`compile`, `get_compile_log`, `get_pdf`, `get_project_info`, `list_templates`.

When the dev server is running and an editor is open, AI edits show up live
in connected browsers via Yjs (the file watcher reflects disk changes back into
the shared CRDT).

## Keyboard

- **Cmd+S** — save (Yjs flushes automatically; this is a manual nudge that
  also schedules a compile)
- **Cmd+Enter** — compile
- **Cmd+Z / Cmd+Shift+Z** — undo / redo (Yjs collaborative undo)

## Diagnostics

```bash
bun run doctor   # checks tectonic, settings, LAN IPs
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

Edit and restart to take effect. You can override the port at boot:
`PORT=4040 bun run dev`.

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
`@modelcontextprotocol/sdk` · iron-session · bcrypt · Bun runtime.
