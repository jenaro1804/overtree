import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "node:path";
import {
  createProject,
  deleteProject,
  listProjects,
  readMeta,
} from "@/lib/core/projects";
import {
  deleteFile,
  editFile,
  listFiles,
  readFile,
  readFileBinary,
  writeFile,
} from "@/lib/core/files";
import { listTemplates } from "@/lib/core/templates";
import { compileAndWait, getSession } from "@/lib/core/compile";
import { applyExternalUpdate } from "@/lib/yjs/doc-manager";
import { resolveInProject } from "@/lib/core/storage";
import { promises as fs } from "node:fs";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function jsonResult(data: unknown) {
  return textResult(JSON.stringify(data, null, 2));
}

function errorResult(msg: string) {
  return { isError: true, content: [{ type: "text" as const, text: msg }] };
}

/**
 * Build an MCP server with all Overtree tools registered.
 * Used by both stdio (mcp-server/stdio.ts) and HTTP/SSE (app/api/mcp).
 */
export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "overtree",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {}, resources: {} },
    },
  );

  server.registerTool(
    "list_projects",
    {
      description: "List all Overtree projects with their IDs and metadata.",
      inputSchema: {},
    },
    async () => {
      const projects = await listProjects();
      return jsonResult(projects);
    },
  );

  server.registerTool(
    "list_templates",
    {
      description: "List the built-in project templates available for new projects.",
      inputSchema: {},
    },
    async () => {
      const templates = await listTemplates();
      return jsonResult(templates);
    },
  );

  server.registerTool(
    "create_project",
    {
      description:
        "Create a new project from a template. Templates: article, beamer, report, letter, ieee, blank.",
      inputSchema: {
        name: z.string().min(1).describe("Display name for the new project"),
        template: z
          .string()
          .optional()
          .describe("Template id, defaults to 'article'"),
      },
    },
    async ({ name, template }) => {
      const meta = await createProject({ name, template });
      return jsonResult(meta);
    },
  );

  server.registerTool(
    "delete_project",
    {
      description:
        "Delete a project and all its files. Set confirm to true to actually delete.",
      inputSchema: {
        project_id: z.string(),
        confirm: z.boolean(),
      },
    },
    async ({ project_id, confirm }) => {
      if (!confirm)
        return errorResult(
          "Refusing to delete without confirm:true. This is destructive.",
        );
      await deleteProject(project_id);
      return textResult(`Deleted project ${project_id}`);
    },
  );

  server.registerTool(
    "list_files",
    {
      description: "List the file tree of a project.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => {
      const tree = await listFiles(project_id);
      return jsonResult(tree);
    },
  );

  server.registerTool(
    "read_file",
    {
      description:
        "Read a UTF-8 text file from a project (e.g. main.tex, refs.bib).",
      inputSchema: {
        project_id: z.string(),
        path: z.string().describe("Project-relative file path"),
      },
    },
    async ({ project_id, path: rel }) => {
      const content = await readFile(project_id, rel);
      return textResult(content);
    },
  );

  server.registerTool(
    "write_file",
    {
      description:
        "Create or overwrite a file in a project. Connected editors will see the change live.",
      inputSchema: {
        project_id: z.string(),
        path: z.string(),
        content: z.string(),
      },
    },
    async ({ project_id, path: rel, content }) => {
      await writeFile(project_id, rel, content);
      try {
        await applyExternalUpdate(project_id, rel, content);
      } catch {
        /* not in the same process — chokidar will reflect the change */
      }
      return textResult(`Wrote ${content.length} chars to ${rel}`);
    },
  );

  server.registerTool(
    "edit_file",
    {
      description:
        "Replace exactly one occurrence of old_string with new_string in a file. Errors if old_string is missing or matches more than once.",
      inputSchema: {
        project_id: z.string(),
        path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
      },
    },
    async ({ project_id, path: rel, old_string, new_string }) => {
      try {
        await editFile(project_id, rel, old_string, new_string);
        try {
          const next = await readFile(project_id, rel);
          await applyExternalUpdate(project_id, rel, next);
        } catch {}
        return textResult(`Edited ${rel}`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a file or directory in a project. Requires confirm:true.",
      inputSchema: {
        project_id: z.string(),
        path: z.string(),
        confirm: z.boolean(),
      },
    },
    async ({ project_id, path: rel, confirm }) => {
      if (!confirm) return errorResult("Refusing to delete without confirm:true.");
      await deleteFile(project_id, rel);
      return textResult(`Deleted ${rel}`);
    },
  );

  server.registerTool(
    "compile",
    {
      description:
        "Compile a project to PDF using Tectonic. Waits for completion. Returns log summary, error count, and pdf path.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => {
      const session = await compileAndWait(project_id);
      const summary = {
        ok: session.status === "ok",
        exitCode: session.exitCode,
        errors: session.errors,
        pdfPath: session.pdfPath,
        logTail: session.log.slice(-30),
      };
      return jsonResult(summary);
    },
  );

  server.registerTool(
    "get_compile_log",
    {
      description: "Return the most recent compile log for a project.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => {
      const session = getSession(project_id);
      if (!session) return textResult("No compile log yet.");
      return jsonResult({
        status: session.status,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        errors: session.errors,
        log: session.log,
      });
    },
  );

  server.registerTool(
    "get_pdf",
    {
      description:
        "Return the latest compiled PDF as base64. Useful for AI clients that want to inspect the output.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => {
      try {
        const meta = await readMeta(project_id);
        const pdfRel = `output/${meta.mainFile.replace(/\.tex$/, ".pdf")}`;
        const buf = await readFileBinary(project_id, pdfRel);
        return {
          content: [
            {
              type: "text" as const,
              text: `pdf size: ${buf.length} bytes`,
            },
            {
              type: "resource" as const,
              resource: {
                uri: `overtree://projects/${project_id}/${pdfRel}`,
                mimeType: "application/pdf",
                blob: buf.toString("base64"),
              },
            },
          ],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "no pdf");
      }
    },
  );

  server.registerTool(
    "get_project_info",
    {
      description:
        "Return metadata for a project (name, mainFile, template, createdAt).",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => {
      const meta = await readMeta(project_id);
      return jsonResult({ ...meta, passwordHash: undefined });
    },
  );

  // Resources: expose project files for browsing
  server.registerResource(
    "project-file",
    new ResourceTemplate("overtree://projects/{project_id}/{+path}", {
      list: undefined,
    }),
    {
      title: "Overtree project file",
      description: "Read a file from an Overtree project",
    },
    async (uri, vars) => {
      const projectId = String(vars.project_id);
      const rel = String(vars.path);
      const ext = path.extname(rel).toLowerCase();
      try {
        const abs = await resolveInProject(projectId, rel);
        const stat = await fs.stat(abs);
        if (stat.isDirectory()) {
          const tree = await listFiles(projectId);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(tree, null, 2),
              },
            ],
          };
        }
        if (ext === ".pdf") {
          const buf = await readFileBinary(projectId, rel);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/pdf",
                blob: buf.toString("base64"),
              },
            ],
          };
        }
        const content = await readFile(projectId, rel);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: ext === ".tex" ? "text/x-tex" : "text/plain",
              text: content,
            },
          ],
        };
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "read failed");
      }
    },
  );

  return server;
}
