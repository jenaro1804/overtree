import { NextResponse } from "next/server";
import { listFolders, listProjects } from "@/lib/core/projects";
import {
  type Layout,
  readLayout,
  reconcile,
  writeLayout,
} from "@/lib/core/layout";

/** Map folder path ("" = root) -> project ids currently in it. */
async function projectsByFolder(): Promise<Record<string, string[]>> {
  const projects = await listProjects();
  const map: Record<string, string[]> = {};
  for (const p of projects) {
    (map[p.folder] ??= []).push(p.id);
  }
  return map;
}

export async function GET() {
  const [layout, folders, byFolder] = await Promise.all([
    readLayout(),
    listFolders(),
    projectsByFolder(),
  ]);
  return NextResponse.json({ layout: reconcile(layout, folders, byFolder) });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<Layout> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid layout" }, { status: 400 });
  }
  const layout: Layout = {
    subjectOrder: Array.isArray(body.subjectOrder) ? body.subjectOrder : [],
    projectOrder:
      body.projectOrder && typeof body.projectOrder === "object"
        ? body.projectOrder
        : {},
    sort: body.sort && typeof body.sort === "object" ? body.sort : {},
  };
  await writeLayout(layout);
  return NextResponse.json({ ok: true });
}
