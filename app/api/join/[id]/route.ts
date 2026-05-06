import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/core/auth";
import { readMeta } from "@/lib/core/projects";

const PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
];

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    color?: string;
    password?: string;
  };
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  let meta;
  try {
    meta = await readMeta(id);
  } catch {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  if (meta.private && meta.passwordHash) {
    if (
      !body.password ||
      !(await bcrypt.compare(body.password, meta.passwordHash))
    ) {
      return NextResponse.json({ error: "wrong password" }, { status: 403 });
    }
  }
  const session = await getSession();
  session.name = name;
  session.color =
    body.color || session.color || PALETTE[Math.floor(Math.random() * PALETTE.length)];
  session.projectAccess = session.projectAccess ?? {};
  session.projectAccess[id] = { joinedAt: Date.now() };
  await session.save();
  return NextResponse.json({
    ok: true,
    name: session.name,
    color: session.color,
  });
}
