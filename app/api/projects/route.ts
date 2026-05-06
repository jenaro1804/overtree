import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/core/projects";
import bcrypt from "bcryptjs";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    template?: string;
    private?: boolean;
    password?: string;
  };
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  let passwordHash: string | undefined;
  if (body.private && body.password) {
    passwordHash = await bcrypt.hash(body.password, 10);
  }
  const meta = await createProject({
    name: body.name,
    template: body.template,
    private: !!body.private,
    passwordHash,
  });
  return NextResponse.json({ project: meta }, { status: 201 });
}
