"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.mjs";
}

type Props = {
  src: string | null;
};

export function PdfViewer({ src }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(600);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      setWidth(Math.max(280, el.clientWidth - 24));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!src) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Compile (Cmd+Enter) to see PDF.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="h-full overflow-auto scrollbar-thin bg-zinc-900 px-3 py-3"
    >
      <Document
        file={src}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={
          <p className="text-zinc-500 text-sm text-center py-8">Loading PDF…</p>
        }
        error={
          <p className="text-red-400 text-sm text-center py-8">
            Failed to load PDF
          </p>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div key={i} className="mb-3 shadow-lg">
            <Page
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer={false}
              renderTextLayer={false}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
