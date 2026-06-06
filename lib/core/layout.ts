import { promises as fs } from "node:fs";
import path from "node:path";
import { projectsRoot } from "./storage";

// Persisted menu layout: custom order of subjects, custom order of projects
// within a subject, and the chosen sort mode per subject. Lives under
// rootDir/.overtree/ (ignored by the project scan since it starts with "."),
// so it syncs via OneDrive but never looks like a subject folder. Written only
// when the user reorders / changes sort — not on every read — to avoid churn.

export type SortMode = "custom" | "alphabetical" | "updated";

export type Layout = {
  /** Subject folder paths (relative to root) in custom order. */
  subjectOrder: string[];
  /** folder path -> project ids in custom order ("" = root). */
  projectOrder: Record<string, string[]>;
  /** folder path -> chosen sort mode ("" = root). */
  sort: Record<string, SortMode>;
};

export const DEFAULT_SORT: SortMode = "updated";

function emptyLayout(): Layout {
  return { subjectOrder: [], projectOrder: {}, sort: {} };
}

async function layoutFile(): Promise<string> {
  return path.join(await projectsRoot(), ".overtree", "layout.json");
}

export async function readLayout(): Promise<Layout> {
  try {
    const raw = await fs.readFile(await layoutFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Layout>;
    return {
      subjectOrder: Array.isArray(parsed.subjectOrder) ? parsed.subjectOrder : [],
      projectOrder:
        parsed.projectOrder && typeof parsed.projectOrder === "object"
          ? parsed.projectOrder
          : {},
      sort: parsed.sort && typeof parsed.sort === "object" ? parsed.sort : {},
    };
  } catch {
    return emptyLayout();
  }
}

export async function writeLayout(layout: Layout): Promise<void> {
  const file = await layoutFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(layout, null, 2), "utf8");
}

/**
 * Reconcile a stored layout against what's actually on disk: keep the saved
 * order for things that still exist, append newly-appeared subjects/projects,
 * and prune ones that vanished. Pure (does not write). `projectsByFolder` maps
 * a folder path ("" = root) to the project ids currently in it.
 */
export function reconcile(
  layout: Layout,
  folders: string[],
  projectsByFolder: Record<string, string[]>,
): Layout {
  // Subjects: saved order first (still-present only), then new ones (sorted).
  const folderSet = new Set(folders);
  const orderedSubjects = layout.subjectOrder.filter((f) => folderSet.has(f));
  const seen = new Set(orderedSubjects);
  for (const f of [...folders].sort()) {
    if (!seen.has(f)) orderedSubjects.push(f);
  }

  // Projects per folder: saved order first (still-present only), then new ones.
  const projectOrder: Record<string, string[]> = {};
  const sort: Record<string, SortMode> = {};
  for (const folder of Object.keys(projectsByFolder)) {
    const present = projectsByFolder[folder];
    const presentSet = new Set(present);
    const saved = (layout.projectOrder[folder] ?? []).filter((id) =>
      presentSet.has(id),
    );
    const savedSet = new Set(saved);
    for (const id of present) if (!savedSet.has(id)) saved.push(id);
    projectOrder[folder] = saved;
    sort[folder] = layout.sort[folder] ?? DEFAULT_SORT;
  }

  return { subjectOrder: orderedSubjects, projectOrder, sort };
}
