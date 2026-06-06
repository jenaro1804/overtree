import { NextResponse } from "next/server";
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
} from "@/lib/core/projects";

export async function GET() {
  const folders = await listFolders();
  return NextResponse.json({ folders });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { path?: string };
  if (!body.path || typeof body.path !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  try {
    await createFolder(body.path);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    from?: string;
    to?: string;
  };
  if (!body.from || !body.to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }
  try {
    await renameFolder(body.from, body.to);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Couldn't rename the folder — close any open projects inside it or pause OneDrive and try again.",
        locked: true,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { path?: string };
  if (!body.path || typeof body.path !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  try {
    await deleteFolder(body.path);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
