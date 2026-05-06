import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

let cached: WebStandardStreamableHTTPServerTransport | null = null;

async function getTransport() {
  if (cached) return cached;
  const server = await createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: false,
  });
  await server.connect(transport);
  cached = transport;
  return transport;
}

export async function POST(req: Request) {
  const t = await getTransport();
  return t.handleRequest(req);
}

export async function GET(req: Request) {
  const t = await getTransport();
  return t.handleRequest(req);
}

export async function DELETE(req: Request) {
  const t = await getTransport();
  return t.handleRequest(req);
}
