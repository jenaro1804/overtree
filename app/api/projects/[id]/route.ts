import { NextResponse } from "next/server";
import {
  deleteProject,
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
  };
  let meta = await readMeta(id);
  if (body.name) meta = await renameProject(id, body.name);
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
