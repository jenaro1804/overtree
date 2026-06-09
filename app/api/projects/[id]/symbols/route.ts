import { NextResponse } from "next/server";
import { listProjectSymbols } from "@/lib/core/files";

type Ctx = { params: Promise<{ id: string }> };

// Symbols the editor autocompletes from the project itself: citation keys,
// \label keys, and .tex / image paths. See lib/core/files.ts.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const symbols = await listProjectSymbols(id);
    return NextResponse.json(symbols);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}
