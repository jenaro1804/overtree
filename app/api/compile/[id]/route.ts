import { NextResponse } from "next/server";
import { compile, getSession, type CompileEvent } from "@/lib/core/compile";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const session = await compile(id);
    return NextResponse.json({
      status: session.status,
      startedAt: session.startedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = getSession(id);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: CompileEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      if (!session) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "idle" })}\n\n`),
        );
        controller.close();
        return;
      }
      // Replay buffered log
      for (const line of session.log) {
        send({ type: "log", line, stream: "stdout" });
      }
      if (session.status !== "running") {
        for (const err of session.errors) {
          send({ type: "error", line: err.line, message: err.message });
        }
        send({
          type: "done",
          ok: session.status === "ok",
          exitCode: session.exitCode ?? -1,
          pdfPath: session.pdfPath,
        });
        controller.close();
        return;
      }
      const onEvent = (e: CompileEvent) => {
        send(e);
        if (e.type === "done") {
          session.emitter.off("event", onEvent);
          controller.close();
        }
      };
      session.emitter.on("event", onEvent);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
