import { NextResponse } from "next/server";
import {
  deleteProject,
  moveProject,
  readMeta,
  renameProject,
  setProjectPassword,
} from "@/lib/core/projects";
import bcrypt from "bcryptjs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const meta = await readMeta(id);
    return NextResponse.json({
      project: { ...meta, passwordHash: undefined },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    password?: string | null;
    folder?: string;
  };
  let meta = await readMeta(id);
  // Folder moves (rename/move) touch the filesystem and can fail on locks —
  // surface a 409 with a friendly hint instead of a 500, leaving state unchanged.
  try {
    if (body.name) meta = await renameProject(id, body.name);
    if (typeof body.folder === "string") meta = await moveProject(id, body.folder);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Couldn't move the project folder — close the project or pause OneDrive and try again.",
        locked: true,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 409 },
    );
  }
  if (body.password === null) {
    meta = await setProjectPassword(id, null);
  } else if (typeof body.password === "string" && body.password.length > 0) {
    const hash = await bcrypt.hash(body.password, 10);
    meta = await setProjectPassword(id, hash);
  }
  return NextResponse.json({
    project: { ...meta, passwordHash: undefined },
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
