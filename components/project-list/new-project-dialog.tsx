"use client";

import { useEffect, useState } from "react";
import { XIcon } from "@/components/icons";

type Props = {
  open: boolean;
  folders: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
};

const NEW_SUBJECT = "__new__";

export function NewProjectDialog({ open, folders, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("article");
  const [templates, setTemplates] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setName("");
      setTemplate("article");
      setFolder("");
      setNewSubject("");
      setIsPrivate(false);
      setPassword("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (isPrivate && password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (folder === NEW_SUBJECT && !newSubject.trim()) {
      setError("Enter a name for the new subject");
      return;
    }
    const targetFolder = folder === NEW_SUBJECT ? newSubject.trim() : folder;
    setSubmitting(true);
    setError(null);
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        template,
        private: isPrivate,
        password,
        folder: targetFolder,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? "Could not create project");
      setSubmitting(false);
      return;
    }
    onCreated(j.project.id);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={submit}
        className="bg-panel border border-border rounded-xl w-full max-w-md p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">New project</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            <XIcon />
          </button>
        </div>

        <label className="block text-sm mb-1 text-muted">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My paper"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />

        <label className="block text-sm mt-4 mb-1 text-muted">
          Template
        </label>
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="block text-sm mt-4 mb-1 text-muted">Subject</label>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">No subject</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          <option value={NEW_SUBJECT}>+ New subject…</option>
        </select>
        {folder === NEW_SUBJECT && (
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="New subject name"
            className="w-full mt-2 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        )}

        <label className="flex items-center gap-2 mt-4 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          Private (require password)
        </label>

        {isPrivate && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Project password"
            className="w-full mt-2 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="px-4 py-2 rounded-md bg-accent hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
