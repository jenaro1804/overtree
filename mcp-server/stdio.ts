#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../lib/mcp/server";

async function main() {
  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stays up until stdin closes.
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[overtree-mcp] fatal:", err);
  process.exit(1);
});
