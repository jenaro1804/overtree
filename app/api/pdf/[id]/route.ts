import path from "node:path";
import { promises as fs } from "node:fs";
import { readMeta } from "@/lib/core/projects";
import { projectOutputDir } from "@/lib/core/storage";

type Ctx = { params: Promise<{ id: string }> };

// The compiled PDF lives in the per-machine cache (out of OneDrive), so it can
// no longer be served through /api/files (resolveInProject rejects paths
// outside the project dir). This route reads it straight from the cache.
// projectOutputDir validates the id (isSafeId), so there is no traversal risk.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const meta = await readMeta(id);
    const pdfFile = meta.mainFile.replace(/\.tex$/i, ".pdf");
    const abs = path.join(projectOutputDir(id), pdfFile);
    const buf = await fs.readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "not found" }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
}
