import { NextResponse } from "next/server";
import { docManager } from "@/lib/yjs/doc-manager-bridge";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await docManager().flushProjectDocs(id);
    return NextResponse.json({ ok: true, savedAt: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "save failed" },
      { status: 500 },
    );
  }
}
