"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  snippetCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import { encodeRoom } from "@/lib/identity";
import type { Theme } from "@/lib/theme";

// In dark, oneDark paints the selected autocomplete option *darker* than the
// rest, so it reads as unselected. Flip it: dim the unselected options and make
// the active one the brightest (light foreground + a subtle surface fill). Lives
// next to oneDark so it only applies in dark — light already highlights in blue.
const darkAutocompleteFix = EditorView.theme({
  ".cm-tooltip-autocomplete > ul > li": {
    color: "var(--muted)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--surface)",
    color: "var(--foreground)",
  },
});

// Dark = oneDark; light = no extra theme (basicSetup ships a light highlight).
const themeExtension = (theme: Theme) =>
  theme === "dark" ? [oneDark, darkAutocompleteFix] : [];

// --- Compile-error line highlighting -------------------------------------
// The editor-shell pushes the lines Tectonic flagged (and clears them when a new
// compile starts) through these effects; the field keeps the line decorations
// in sync as the document is edited.
const setErrorLines = StateEffect.define<number[]>();
const clearErrorLines = StateEffect.define<null>();
const errorLineDeco = Decoration.line({ class: "cm-errorLine" });

const errorLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearErrorLines)) {
        deco = Decoration.none;
      } else if (e.is(setErrorLines)) {
        const doc = tr.state.doc;
        const ranges = [];
        const seen = new Set<number>();
        for (const ln of e.value) {
          if (ln < 1 || ln > doc.lines || seen.has(ln)) continue;
          seen.add(ln);
          ranges.push(errorLineDeco.range(doc.line(ln).from));
        }
        deco = Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// --- LaTeX autocompletion ------------------------------------------------
// Attached to the stex language data so it composes with the autocompletion()
// basicSetup already ships, instead of registering a second instance.

// Commands whose braces hold a project symbol (cite/ref/file): insert `cmd{}`,
// drop the cursor inside, and immediately open the symbol dropdown.
function symbolCommand(cmd: string, detail: string): Completion {
  return {
    label: `\\${cmd}{}`,
    type: "function",
    detail,
    apply: (view, _c, from, to) => {
      const insert = `\\${cmd}{}`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length - 1 },
      });
      startCompletion(view);
    },
  };
}

const commandCompletions = [
  snippetCompletion("\\section{${title}}", { label: "\\section{}", type: "keyword", detail: "Section" }),
  snippetCompletion("\\subsection{${title}}", { label: "\\subsection{}", type: "keyword", detail: "Subsection" }),
  snippetCompletion("\\subsubsection{${title}}", { label: "\\subsubsection{}", type: "keyword", detail: "Subsubsection" }),
  snippetCompletion("\\paragraph{${title}}", { label: "\\paragraph{}", type: "keyword", detail: "Paragraph" }),
  snippetCompletion("\\textbf{${text}}", { label: "\\textbf{}", type: "keyword", detail: "Bold" }),
  snippetCompletion("\\textit{${text}}", { label: "\\textit{}", type: "keyword", detail: "Italic" }),
  snippetCompletion("\\underline{${text}}", { label: "\\underline{}", type: "keyword", detail: "Underline" }),
  snippetCompletion("\\emph{${text}}", { label: "\\emph{}", type: "keyword", detail: "Emphasis" }),
  symbolCommand("includegraphics", "Image"),
  snippetCompletion("\\caption{${text}}", { label: "\\caption{}", type: "function", detail: "Caption" }),
  snippetCompletion("\\label{${key}}", { label: "\\label{}", type: "function", detail: "Label" }),
  symbolCommand("ref", "Reference"),
  symbolCommand("eqref", "Equation reference"),
  symbolCommand("cite", "Citation"),
  symbolCommand("input", "Input file"),
  snippetCompletion("\\url{${url}}", { label: "\\url{}", type: "function", detail: "URL" }),
  snippetCompletion("\\begin{${env}}\n\t${}\n\\end{${env}}", { label: "\\begin{}", type: "keyword", detail: "Environment" }),
  snippetCompletion("\\end{${env}}", { label: "\\end{}", type: "keyword", detail: "End environment" }),
];

const environmentNames = [
  "figure",
  "table",
  "equation",
  "align",
  "itemize",
  "enumerate",
];

// --- Project-aware symbols (\cite, \ref, \input, \includegraphics) -------
// Fetched from /api/projects/<id>/symbols and cached briefly so the dropdown is
// near-fresh without re-fetching on every keystroke.
type ProjectSymbols = {
  citations: { key: string; title?: string }[];
  labels: { key: string; file?: string }[];
  texFiles: string[];
  imageFiles: string[];
};
const EMPTY_SYMBOLS: ProjectSymbols = {
  citations: [],
  labels: [],
  texFiles: [],
  imageFiles: [],
};
const SYMBOLS_TTL = 10_000;
const symbolsCache = new Map<string, { data: ProjectSymbols; ts: number }>();

async function fetchProjectSymbols(projectId: string): Promise<ProjectSymbols> {
  const cached = symbolsCache.get(projectId);
  if (cached && Date.now() - cached.ts < SYMBOLS_TTL) return cached.data;
  try {
    const r = await fetch(`/api/projects/${projectId}/symbols`);
    if (!r.ok) return cached?.data ?? EMPTY_SYMBOLS;
    const data = (await r.json()) as ProjectSymbols;
    symbolsCache.set(projectId, { data, ts: Date.now() });
    return data;
  } catch {
    return cached?.data ?? EMPTY_SYMBOLS;
  }
}

// Cite commands (anything containing "cite"), with optional [..] options.
const CITE_RE = /\\[a-zA-Z]*cite[a-zA-Z]*\*?\s*(?:\[[^\]]*\]\s*)*\{[^}]*$/;
// Cross-reference commands — explicit list so \href (contains "ref") is excluded.
const REF_RE =
  /\\(?:ref|eqref|pageref|autoref|vref|cref|Cref|cpageref|Cpageref|nameref|labelcref)\*?\s*\{[^}]*$/;
const GRAPHICS_RE = /\\includegraphics\s*(?:\[[^\]]*\]\s*)?\{[^}]*$/;
const INPUT_RE = /\\(?:input|include|subfile)\s*\{[^}]*$/;

// When the user types the opening "{" of a symbol command, open the dropdown
// right away (CodeMirror only auto-opens on word chars, not "{").
const SYMBOL_OPEN_RE =
  /\\(?:[a-zA-Z]*cite[a-zA-Z]*|ref|eqref|pageref|autoref|vref|cref|Cref|cpageref|Cpageref|nameref|labelcref|includegraphics|input|include|subfile)\*?\s*(?:\[[^\]]*\]\s*)*\{$/;

const openSymbolCompletion = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  let trigger = false;
  update.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
    if (trigger || inserted.length === 0) return;
    const text = inserted.toString();
    if (text[text.length - 1] !== "{") return;
    const before = update.state.sliceDoc(Math.max(0, toB - 160), toB);
    if (SYMBOL_OPEN_RE.test(before)) trigger = true;
  });
  // Defer: can't dispatch (startCompletion does) during an update.
  if (trigger) queueMicrotask(() => startCompletion(update.view));
});

function makeLatexCompletions(projectId: string): CompletionSource {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    // \cite{…} → citation keys from the .bib files.
    if (context.matchBefore(CITE_RE)) {
      const tok = context.matchBefore(/[^{},\s]*$/);
      const { citations } = await fetchProjectSymbols(projectId);
      if (!citations.length) return null;
      return {
        from: tok ? tok.from : context.pos,
        options: citations.map(
          (c): Completion => ({
            label: c.key,
            type: "variable",
            detail: c.title,
          }),
        ),
        validFor: /^[^{},\s]*$/,
      };
    }

    // \ref{…} and friends → \label keys from the .tex files.
    if (context.matchBefore(REF_RE)) {
      const tok = context.matchBefore(/[^{},\s]*$/);
      const { labels } = await fetchProjectSymbols(projectId);
      if (!labels.length) return null;
      return {
        from: tok ? tok.from : context.pos,
        options: labels.map(
          (l): Completion => ({
            label: l.key,
            type: "variable",
            detail: l.file,
          }),
        ),
        validFor: /^[^{},\s]*$/,
      };
    }

    // \includegraphics{…} → image paths.
    if (context.matchBefore(GRAPHICS_RE)) {
      const tok = context.matchBefore(/[^{}]*$/);
      const { imageFiles } = await fetchProjectSymbols(projectId);
      if (!imageFiles.length) return null;
      return {
        from: tok ? tok.from : context.pos,
        options: imageFiles.map((p): Completion => ({ label: p, type: "file" })),
        validFor: /^[^{}]*$/,
      };
    }

    // \input{…} / \include{…} → other .tex (label without the .tex extension).
    if (context.matchBefore(INPUT_RE)) {
      const tok = context.matchBefore(/[^{}]*$/);
      const { texFiles } = await fetchProjectSymbols(projectId);
      if (!texFiles.length) return null;
      return {
        from: tok ? tok.from : context.pos,
        options: texFiles.map(
          (p): Completion => ({
            label: p.replace(/\.tex$/i, ""),
            type: "file",
          }),
        ),
        validFor: /^[^{}]*$/,
      };
    }

    // Inside \begin{…} or \end{…}: complete the environment name.
    const env = context.matchBefore(/\\(?:begin|end)\{[a-zA-Z*]*/);
    if (env) {
      const from = env.from + env.text.indexOf("{") + 1;
      return {
        from,
        options: environmentNames.map((name) => ({ label: name, type: "type" })),
        validFor: /^[a-zA-Z*]*$/,
      };
    }

    // A command being typed: \se… → suggest command snippets.
    const cmd = context.matchBefore(/\\[a-zA-Z]*/);
    if (cmd) {
      if (cmd.from === cmd.to && !context.explicit) return null;
      return {
        from: cmd.from,
        options: commandCompletions,
        validFor: /^\\[a-zA-Z]*$/,
      };
    }

    return null;
  };
}

const stexLang = StreamLanguage.define(stex);

function wrapSelection(view: EditorView, before: string, after: string) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const selected = view.state.sliceDoc(range.from, range.to);
      const insert = before + selected + after;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(
          range.from + before.length,
          range.from + before.length + selected.length,
        ),
      };
    }),
  );
  view.focus();
}

export type CodeMirrorHandle = {
  gotoLine: (line: number) => void;
  markErrorLines: (lines: number[]) => void;
  clearErrorMarks: () => void;
};

export type Peer = { clientId: number; name: string; color: string };

type Props = {
  projectId: string;
  path: string;
  userName: string;
  userColor: string;
  theme: Theme;
  onSave?: () => void;
  onCompile?: () => void;
  onPeers?: (peers: Peer[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  onReady?: (handle: CodeMirrorHandle) => void;
};

export function YjsCodeMirror({
  projectId,
  path,
  userName,
  userColor,
  theme,
  onSave,
  onCompile,
  onPeers,
  onConnectionChange,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeComp = useRef(new Compartment());
  // Initial theme for editor creation, kept out of the main effect's deps so a
  // theme switch reconfigures the compartment instead of recreating the editor.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onSaveRef = useRef(onSave);
  const onCompileRef = useRef(onCompile);
  const onPeersRef = useRef(onPeers);
  const onConnRef = useRef(onConnectionChange);
  const onReadyRef = useRef(onReady);

  onSaveRef.current = onSave;
  onCompileRef.current = onCompile;
  onPeersRef.current = onPeers;
  onConnRef.current = onConnectionChange;
  onReadyRef.current = onReady;

  useEffect(() => {
      if (!containerRef.current) return;
      const isTex =
        path.endsWith(".tex") ||
        path.endsWith(".bib") ||
        path.endsWith(".sty") ||
        path.endsWith(".cls");

      const ydoc = new Y.Doc();
      const ytext = ydoc.getText("content");
      const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
      const serverUrl = `${wsProto}://${window.location.host}/_yjs`;
      const room = encodeRoom(projectId, path);
      const provider = new WebsocketProvider(serverUrl, room, ydoc, {
        connect: true,
      });
      provider.awareness.setLocalStateField("user", {
        name: userName,
        color: userColor,
      });

      provider.on("status", (e: { status: string }) => {
        onConnRef.current?.(e.status === "connected");
      });

      const updatePeers = () => {
        const states = provider.awareness.getStates();
        const me = provider.awareness.clientID;
        const peers: Peer[] = [];
        states.forEach((state, clientId) => {
          if (clientId === me) return;
          const u = (state as { user?: Peer }).user;
          if (u) peers.push({ clientId, name: u.name, color: u.color });
        });
        onPeersRef.current?.(peers);
      };
      provider.awareness.on("change", updatePeers);
      updatePeers();

      const undoMgr = new Y.UndoManager(ytext);

      const view = new EditorView({
        state: EditorState.create({
          extensions: [
            basicSetup,
            themeComp.current.of(themeExtension(themeRef.current)),
            ...(isTex
              ? [
                  stexLang,
                  stexLang.data.of({
                    autocomplete: makeLatexCompletions(projectId),
                  }),
                  openSymbolCompletion,
                ]
              : []),
            errorLineField,
            yCollab(ytext, provider.awareness, { undoManager: undoMgr }),
            // Prec.highest so these win over basicSetup's keymaps, which
            // otherwise capture the keys before our bindings run.
            Prec.highest(
              keymap.of([
                {
                  key: "Mod-s",
                  preventDefault: true,
                  run: () => {
                    onSaveRef.current?.();
                    return true;
                  },
                },
                {
                  key: "Mod-Enter",
                  preventDefault: true,
                  run: () => {
                    onCompileRef.current?.();
                    return true;
                  },
                },
                {
                  key: "Mod-b",
                  preventDefault: true,
                  run: (view) => {
                    wrapSelection(view, "\\textbf{", "}");
                    return true;
                  },
                },
                {
                  key: "Mod-i",
                  preventDefault: true,
                  run: (view) => {
                    wrapSelection(view, "\\textit{", "}");
                    return true;
                  },
                },
                {
                  key: "Mod-u",
                  preventDefault: true,
                  run: (view) => {
                    wrapSelection(view, "\\underline{", "}");
                    return true;
                  },
                },
              ]),
            ),
            keymap.of([indentWithTab, ...defaultKeymap]),
            EditorView.lineWrapping,
            EditorView.theme({
              "&": { height: "100%" },
              ".cm-scroller": { overflow: "auto" },
              // Red highlight + left bar (inset shadow avoids layout shift) for
              // lines Tectonic flagged. State colors stay literal.
              ".cm-errorLine": {
                backgroundColor: "rgba(248, 113, 113, 0.25)",
                boxShadow: "inset 3px 0 0 0 rgb(248, 113, 113)",
              },
            }),
          ],
        }),
        parent: containerRef.current,
      });
      viewRef.current = view;
      onReadyRef.current?.({
        gotoLine(line: number) {
          const total = view.state.doc.lines;
          const target = Math.max(1, Math.min(total, line));
          const li = view.state.doc.line(target);
          view.dispatch({
            selection: { anchor: li.from, head: li.from },
            effects: EditorView.scrollIntoView(li.from, { y: "center" }),
          });
          view.focus();
        },
        markErrorLines(lines: number[]) {
          view.dispatch({ effects: setErrorLines.of(lines) });
        },
        clearErrorMarks() {
          view.dispatch({ effects: clearErrorLines.of(null) });
        },
      });

      return () => {
        view.destroy();
        provider.awareness.off("change", updatePeers);
        provider.destroy();
        ydoc.destroy();
        viewRef.current = null;
      };
  }, [projectId, path, userName, userColor]);

  // Swap the theme live without recreating the editor (keeps the Yjs
  // connection, scroll position and cursor intact).
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(themeExtension(theme)),
    });
  }, [theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
