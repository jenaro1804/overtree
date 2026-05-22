"use client";

type Props = {
  src: string | null;
};

export function PdfViewer({ src }: Props) {
  if (!src) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm bg-panel">
        Compile (Ctrl+Enter) to see PDF.
      </div>
    );
  }
  return (
    <iframe
      key={src}
      src={src}
      title="PDF preview"
      className="h-full w-full bg-panel"
      style={{ border: 0 }}
    />
  );
}
