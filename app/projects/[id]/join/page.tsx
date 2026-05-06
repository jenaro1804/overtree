import { notFound } from "next/navigation";
import { readMeta } from "@/lib/core/projects";
import { JoinForm } from "./join-form";

type Props = { params: Promise<{ id: string }> };

export default async function JoinPage({ params }: Props) {
  const { id } = await params;
  let meta;
  try {
    meta = await readMeta(id);
  } catch {
    notFound();
  }
  return (
    <JoinForm
      projectId={meta.id}
      projectName={meta.name}
      isPrivate={meta.private}
    />
  );
}
