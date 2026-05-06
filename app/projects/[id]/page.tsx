import { notFound, redirect } from "next/navigation";
import { readMeta } from "@/lib/core/projects";
import { getSession, hasProjectAccess } from "@/lib/core/auth";
import { EditorShell } from "@/components/editor/editor-shell";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  let meta;
  try {
    meta = await readMeta(id);
  } catch {
    notFound();
  }
  const session = await getSession();
  const access = hasProjectAccess(session, meta.id, !meta.private);
  if (!access) {
    redirect(`/projects/${id}/join`);
  }
  return (
    <EditorShell
      project={{ id: meta.id, name: meta.name, mainFile: meta.mainFile }}
      user={{
        name: session.name ?? "Anonymous",
        color: session.color ?? "#3b82f6",
      }}
    />
  );
}
