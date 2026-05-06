import { NextResponse } from "next/server";
import { getSession } from "@/lib/core/auth";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    name: session.name ?? null,
    color: session.color ?? null,
    projectAccess: session.projectAccess ?? {},
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    color?: string;
  };
  const session = await getSession();
  if (body.name) session.name = body.name.trim();
  if (body.color) session.color = body.color;
  await session.save();
  return NextResponse.json({ ok: true });
}
