// Pure, client-safe helpers + types for the project menu tree. No server imports.

export type Project = {
  id: string;
  name: string;
  mainFile: string;
  createdAt: number;
  updatedAt: number;
  private: boolean;
  folder: string;
};

export type SortMode = "custom" | "alphabetical" | "updated";

export type Layout = {
  subjectOrder: string[];
  projectOrder: Record<string, string[]>;
  sort: Record<string, SortMode>;
};

export const ROOT_KEY = "";
export const DEFAULT_SORT: SortMode = "updated";

export const SORT_LABELS: Record<SortMode, string> = {
  alphabetical: "Alphabetical",
  updated: "Last modified",
  custom: "Custom",
};

export type TreeNode = {
  path: string; // "" = root
  name: string; // basename ("" for root)
  children: TreeNode[];
  projects: Project[];
};

/** Group projects by their folder path ("" = root). */
export function groupByFolder(projects: Project[]): Map<string, Project[]> {
  const map = new Map<string, Project[]>();
  for (const p of projects) {
    const key = p.folder || ROOT_KEY;
    let arr = map.get(key);
    if (!arr) map.set(key, (arr = []));
    arr.push(p);
  }
  return map;
}

/**
 * Build a subject tree. `subjectOrder` is the reconciled, ordered list of all
 * folder paths; sibling order follows first-encounter in that list.
 */
export function buildTree(
  subjectOrder: string[],
  byFolder: Map<string, Project[]>,
): TreeNode {
  const root: TreeNode = {
    path: ROOT_KEY,
    name: "",
    children: [],
    projects: byFolder.get(ROOT_KEY) ?? [],
  };
  const nodes = new Map<string, TreeNode>([[ROOT_KEY, root]]);

  for (const folder of subjectOrder) {
    const parts = folder.split("/");
    let cur = ROOT_KEY;
    for (const part of parts) {
      const p = cur ? `${cur}/${part}` : part;
      if (!nodes.has(p)) {
        const node: TreeNode = {
          path: p,
          name: part,
          children: [],
          projects: byFolder.get(p) ?? [],
        };
        nodes.set(p, node);
        nodes.get(cur)!.children.push(node);
      }
      cur = p;
    }
  }
  return root;
}

/** Sort a folder's projects per the chosen mode. */
export function sortProjects(
  projects: Project[],
  mode: SortMode,
  order: string[],
): Project[] {
  const out = [...projects];
  if (mode === "alphabetical") {
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (mode === "updated") {
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const idx = new Map(order.map((id, i) => [id, i]));
  return out.sort(
    (a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9),
  );
}

/** All descendant folder paths of a node (excluding itself). */
export function descendantFolders(subjectOrder: string[], path: string): string[] {
  const prefix = path + "/";
  return subjectOrder.filter((f) => f.startsWith(prefix));
}

/** Parent folder path of a folder ("" for top-level). */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? ROOT_KEY : path.slice(0, i);
}

/** End (exclusive) of the contiguous block of `subjectOrder[start]` + descendants. */
function blockEnd(order: string[], start: number): number {
  const prefix = order[start] + "/";
  let i = start + 1;
  while (i < order.length && order[i].startsWith(prefix)) i++;
  return i;
}

/**
 * Reorder a subject among its SIBLINGS (same parent), dropping it above/below
 * `target`. Moves the whole block (subject + its descendants) so nesting stays
 * intact. No-op if they aren't siblings or it's a self-drop. Pure.
 */
export function reorderSubjects(
  order: string[],
  dragged: string,
  target: string,
  edge: "top" | "bottom",
): string[] {
  if (dragged === target) return order;
  if (parentFolder(dragged) !== parentFolder(target)) return order;
  const dStart = order.indexOf(dragged);
  if (dStart === -1) return order;
  const dEnd = blockEnd(order, dStart);
  const block = order.slice(dStart, dEnd);
  const without = [...order.slice(0, dStart), ...order.slice(dEnd)];
  const tStart = without.indexOf(target);
  if (tStart === -1) return order;
  const insertAt = edge === "bottom" ? blockEnd(without, tStart) : tStart;
  return [...without.slice(0, insertAt), ...block, ...without.slice(insertAt)];
}
