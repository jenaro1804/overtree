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
