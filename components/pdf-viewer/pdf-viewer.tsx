"use client";

type Props = {
  src: string | null;
};

export function PdfViewer({ src }: Props) {
  if (!src) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm bg-zinc-900">
        Compile (Ctrl+Enter) to see PDF.
      </div>
    );
  }
  return (
    <iframe
      key={src}
      src={src}
      title="PDF preview"
      className="h-full w-full bg-zinc-900"
      style={{ border: 0 }}
    />
  );
}
