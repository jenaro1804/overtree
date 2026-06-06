#!/usr/bin/env bun
// One-shot, idempotent migration: rename each project's UUID folder to a
// readable slug derived from its name. The project id is NEVER changed (the
// per-machine cache, Yjs rooms and URLs all key off it), so this is purely
// cosmetic and safe. Run with the dev server OFF to avoid watcher/OneDrive
// locks:  npm run migrate-folders
import path from "node:path";
import { promises as fs } from "node:fs";
import { buildProjectScan, projectsRoot, slugify, uniqueSlug } from "../lib/core/storage";

type Meta = { id: string; name?: string };

async function main() {
  const root = await projectsRoot();
  const scan = await buildProjectScan();
  console.log(`Scanning ${root}`);
  console.log(`Found ${scan.projects.size} project(s).\n`);

  let renamed = 0;
  let skipped = 0;

  for (const [id, dir] of scan.projects) {
    const parent = path.dirname(dir);
    const current = path.basename(dir);
    // Only migrate folders still named exactly like their UUID id.
    if (current !== id) {
      console.log(`skip  ${current}  (already readable)`);
      skipped++;
      continue;
    }
    let name = id;
    try {
      const raw = await fs.readFile(
        path.join(dir, ".overtree", "project.json"),
        "utf8",
      );
      name = (JSON.parse(raw) as Meta).name || id;
    } catch {
      console.log(`skip  ${current}  (unreadable meta)`);
      skipped++;
      continue;
    }
    const slug = await uniqueSlug(parent, slugify(name));
    const target = path.join(parent, slug);
    try {
      await fs.rename(dir, target);
      console.log(`OK    ${current}  ->  ${slug}   "${name}"`);
      renamed++;
    } catch (err) {
      console.error(
        `FAIL  ${current}  ->  ${slug}   ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`\nDone. ${renamed} renamed, ${skipped} skipped.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
