import { NextResponse } from "next/server";
import { listFiles, mkdir, renameFile, writeFile } from "@/lib/core/files";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const tree = await listFiles(id);
    return NextResponse.json({ tree });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    op: "create" | "mkdir" | "rename";
    path?: string;
    from?: string;
    to?: string;
    content?: string;
  };
  try {
    if (body.op === "create" && body.path) {
      await writeFile(id, body.path, body.content ?? "");
    } else if (body.op === "mkdir" && body.path) {
      await mkdir(id, body.path);
    } else if (body.op === "rename" && body.from && body.to) {
      await renameFile(id, body.from, body.to);
    } else {
      return NextResponse.json({ error: "bad op" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}
