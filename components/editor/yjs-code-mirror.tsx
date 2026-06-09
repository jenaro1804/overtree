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
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
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
const commandCompletions = [
  snippetCompletion("\\section{${title}}", { label: "\\section{}", type: "keyword", detail: "Section" }),
  snippetCompletion("\\subsection{${title}}", { label: "\\subsection{}", type: "keyword", detail: "Subsection" }),
  snippetCompletion("\\subsubsection{${title}}", { label: "\\subsubsection{}", type: "keyword", detail: "Subsubsection" }),
  snippetCompletion("\\paragraph{${title}}", { label: "\\paragraph{}", type: "keyword", detail: "Paragraph" }),
  snippetCompletion("\\textbf{${text}}", { label: "\\textbf{}", type: "keyword", detail: "Bold" }),
  snippetCompletion("\\textit{${text}}", { label: "\\textit{}", type: "keyword", detail: "Italic" }),
  snippetCompletion("\\underline{${text}}", { label: "\\underline{}", type: "keyword", detail: "Underline" }),
  snippetCompletion("\\emph{${text}}", { label: "\\emph{}", type: "keyword", detail: "Emphasis" }),
  snippetCompletion("\\includegraphics[${options}]{${file}}", { label: "\\includegraphics[]{}", type: "function", detail: "Image" }),
  snippetCompletion("\\caption{${text}}", { label: "\\caption{}", type: "function", detail: "Caption" }),
  snippetCompletion("\\label{${key}}", { label: "\\label{}", type: "function", detail: "Label" }),
  snippetCompletion("\\ref{${key}}", { label: "\\ref{}", type: "function", detail: "Reference" }),
  snippetCompletion("\\cite{${key}}", { label: "\\cite{}", type: "function", detail: "Citation" }),
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

function latexCompletions(context: CompletionContext): CompletionResult | null {
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
              ? [stexLang, stexLang.data.of({ autocomplete: latexCompletions })]
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
