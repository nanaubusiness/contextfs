import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";

// ── Session State ────────────────────────────────────────────────────────────────

const unlockedFiles = new Set<string>();

// ── MCP Protocol Types ──────────────────────────────────────────────────────────

interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

// ── File Operations ─────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readSummaryOrRaw(filePath: string): Promise<string> {
  const summaryPath = filePath + ".summary";

  // Always prefer summary if it exists
  if (await fileExists(summaryPath)) {
    const content = await fs.readFile(summaryPath, "utf-8");
    return content;
  }

  // Summary doesn't exist — check if this file is unlocked
  if (unlockedFiles.has(filePath)) {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  }

  // File is locked — prompt user
  const approved = await promptApproval(filePath);
  if (approved) {
    unlockedFiles.add(filePath);
    return await fs.readFile(filePath, "utf-8");
  }

  return `ACCESS DENIED: ${filePath} has no .summary file and raw access was not approved.\nAsk the user to run: contextfs build --target ${filePath}\nto generate a summary first.`;
}

function promptApproval(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      `\n🪞 ContextFS: AI requested access to ${filePath}\n   This file has no .summary — raw access costs more tokens.\n   Approve? [y/N] `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      }
    );
  });
}

// ── MCP Request Handler ────────────────────────────────────────────────────────

async function handleRequest(req: MCPRequest): Promise<MCPResponse> {
  const { method, id } = req;

  if (method === "tools/list") {
    const tools: Tool[] = [
      {
        name: "contextfs_read_file",
        description:
          "Read a file using ContextFS. Always returns .summary content when available (cheap). Returns raw content only if explicitly approved by user. Use this instead of native file read tools.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Absolute path to the file to read",
            },
          },
          required: ["file_path"],
        },
      },
      {
        name: "contextfs_query",
        description:
          "Search project summaries to find files related to a topic. Returns ranked results with file paths and relevance scores.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g. 'auth', 'database', 'api')",
            },
            root_dir: {
              type: "string",
              description: "Project root directory to search in",
            },
          },
          required: ["query"],
        },
      },
    ];

    return { jsonrpc: "2.0", id, result: { tools } };
  }

  if (method === "tools/call") {
    const params = req.params as Record<string, unknown> | undefined;
    const toolName = params?.name as string | undefined;
    const toolArgs = params?.arguments as Record<string, unknown> | undefined;

    if (toolName === "contextfs_read_file") {
      const filePath = toolArgs?.file_path as string | undefined;
      if (!filePath) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing required parameter: file_path" },
        };
      }
      const content = await readSummaryOrRaw(filePath);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text" as const,
              text: content,
            },
          ],
          isError: false,
        },
      };
    }

    if (toolName === "contextfs_query") {
      const query = toolArgs?.query as string | undefined;
      const rootDir = (toolArgs?.root_dir as string | undefined) || process.cwd();
      if (!query) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing required parameter: query" },
        };
      }
      try {
        const contextMapPath = path.join(rootDir, "context-map.json");
        if (!(await fileExists(contextMapPath))) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text" as const, text: "No context-map.json found. Run contextfs build first." }],
              isError: false,
            },
          };
        }
        const mapContent = await fs.readFile(contextMapPath, "utf-8");
        const contextMap = JSON.parse(mapContent);
        // Handle both flat format and { files: {} } format
        const files: Record<string, { purpose?: string; summary_path?: string }> =
          "files" in contextMap ? contextMap.files : contextMap;
        const results = Object.entries(files)
          .filter(([, entry]) => {
            return entry.purpose?.toLowerCase().includes(query.toLowerCase());
          })
          .slice(0, 10)
          .map(([filePath, entry]) => {
            return `${filePath}\n  Purpose: ${entry.purpose || "unknown"}\n  Summary: ${entry.summary_path}`;
          })
          .join("\n\n");

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text" as const,
                text: results || "No matching files found.",
              },
            ],
            isError: false,
          },
        };
      } catch {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text" as const, text: "Error querying context-map.json" }],
            isError: false,
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    };
  }

  // Notifications — no response needed
  if (method.startsWith("notifications/")) {
    return { jsonrpc: "2.0", id: null, result: undefined };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

// ── MCP Message Loop ─────────────────────────────────────────────────────────────

async function messageLoop(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let buffer = "";
  const lines: string[] = [];
  let resolver: ((line: string) => void) | null = null;

  // Async line reader
  function readLine(): Promise<string> {
    return new Promise((resolve) => {
      // If we have buffered lines, return them immediately
      if (lines.length > 0) {
        resolve(lines.shift()!);
        return;
      }
      // Otherwise wait for next chunk
      resolver = (line: string) => resolve(line);
    });
  }

  // Start stdin reader
  rl.on("line", (line: string) => {
    if (resolver) {
      resolver(line);
      resolver = null;
    } else {
      lines.push(line);
    }
  });

  // Read-parse-respond loop
  while (true) {
    try {
      const line = await readLine();
      if (!line?.trim()) continue;

      const req = JSON.parse(line) as MCPRequest;
      const res = await handleRequest(req);

      if (res.id !== null) {
        process.stdout.write(JSON.stringify(res) + "\n");
      }
    } catch (err) {
      // Ignore parse errors silently
    }
  }
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────────

export async function runMCP(): Promise<void> {
  // Send capabilities on startup
  const capabilities = {
    jsonrpc: "2.0",
    id: null,
    result: {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  };
  process.stdout.write(JSON.stringify(capabilities) + "\n");

  await messageLoop();
}
