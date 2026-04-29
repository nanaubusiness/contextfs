import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { runCompact, runSessionResume } from "./compact.js";

// ── Session State ────────────────────────────────────────────────────────────────

// Files unlocked during this session — cleared on each new session boundary
const unlockedFiles = new Set<string>();
// Track session to detect when Claude Code starts a new conversation
let lastSessionRoot: string | null = null;

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

// ── Session Reset ─────────────────────────────────────────────────────────────

function resetSessionState(): void {
  const count = unlockedFiles.size;
  unlockedFiles.clear();
  if (count > 0) {
    console.error(`[contextfs mcp] Session reset: re-locked ${count} file(s)`);
  }
}

function normalizeRootUri(uri: string | null): string | null {
  if (!uri) return null;
  // Normalize: remove trailing slash, decode percent-encoding
  let normalized = uri.replace(/\/$/, ""); // trailing slash
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Ignore decode errors
  }
  return normalized;
}

function checkSessionBoundary(rootUri: string | null): void {
  const normalized = normalizeRootUri(rootUri);
  if (normalized && normalized !== normalizeRootUri(lastSessionRoot)) {
    if (lastSessionRoot !== null) {
      // Root changed — new session, reset unlocks
      resetSessionState();
    }
    lastSessionRoot = normalized;
  }
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

  return `ACCESS DENIED: ${path.basename(filePath)} has no .summary file and raw access was not approved.\nAsk the user to run: contextfs build --target <path>\nto generate a summary first.`;
}

function promptApproval(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
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

// ── MCP Request Handler ───────────────────────────────────────────────────────

async function handleRequest(req: MCPRequest): Promise<MCPResponse> {
  const { method, id } = req;

  // Track session via initialize request
  if (method === "initialize") {
    const params = req.params as Record<string, unknown> | undefined;
    const rootUri = (params?.rootUri as string | undefined) ?? null;
    checkSessionBoundary(rootUri);
    // Respond with server capabilities
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        serverInfo: { name: "contextfs", version: "1.0.0" },
      },
    };
  }

  // Reset unlocks on session start notification
  if (method === "notifications/initialized") {
    resetSessionState();
    return { jsonrpc: "2.0", id: null, result: undefined };
  }

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
      {
        name: "contextfs_mcp_reset",
        description:
          "Re-lock all previously unlocked files. Use this at the end of a session or whenever you want to revoke raw file access.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "contextfs_mcp_status",
        description:
          "Show how many files are currently unlocked and their paths.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "contextfs_mcp_compact_session",
        description:
          "Compact the current Claude Code session into a structured summary. Writes to ~/.claude/sessions/summaries/<project-hash>/latest.json for cross-session continuity.",
        inputSchema: {
          type: "object",
          properties: {
            session_id: { type: "string", description: "The current session ID" },
            project_path: { type: "string", description: "Absolute path to the project directory" },
          },
          required: ["session_id", "project_path"],
        },
      },
      {
        name: "contextfs_mcp_get_session_summary",
        description:
          "Get the previous session's summary for the current project. Use at session start to restore context from the last session.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string", description: "Absolute path to the project directory" },
          },
          required: ["project_path"],
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

    if (toolName === "contextfs_mcp_reset") {
      const count = unlockedFiles.size;
      resetSessionState();
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text" as const,
              text: `Re-locked ${count} file(s). All files now require approval to access raw content.`,
            },
          ],
          isError: false,
        },
      };
    }

    if (toolName === "contextfs_mcp_status") {
      const unlocked = Array.from(unlockedFiles);
      if (unlocked.length === 0) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text" as const, text: "No files are currently unlocked." }],
            isError: false,
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text" as const,
              text: `${unlocked.length} file(s) currently unlocked:\n${unlocked.map(f => `  - ${f}`).join("\n")}`,
            },
          ],
          isError: false,
        },
      };
    }

    if (toolName === "contextfs_mcp_compact_session") {
      const sessionId = toolArgs?.session_id as string | undefined;
      const projectPath = toolArgs?.project_path as string | undefined;
      if (!sessionId || !projectPath) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing required parameters: session_id, project_path" },
        };
      }
      try {
        await runCompact({ sessionId, projectPath });
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text" as const, text: `Session compact failed: ${err}` }],
            isError: true,
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text" as const, text: "Session compacted." }],
          isError: false,
        },
      };
    }

    if (toolName === "contextfs_mcp_get_session_summary") {
      const projectPath = toolArgs?.project_path as string | undefined;
      if (!projectPath) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing required parameter: project_path" },
        };
      }
      const resumeOutput = await runSessionResume({ projectPath });
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text" as const, text: resumeOutput || "(No previous session summary found.)" }],
          isError: false,
        },
      };
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

  // Close readline on process exit to prevent handle leak
  rl.on("close", () => {});
  process.on("exit", () => rl.close());

  // Accumulate lines until we have valid JSON
  let buffer = "";

  for await (const line of rl) {
    buffer += (buffer ? "\n" : "") + line;
    try {
      JSON.parse(buffer); // throws if incomplete
    } catch {
      continue; // need more lines
    }

    // Valid JSON — process it
    try {
      const req = JSON.parse(buffer) as MCPRequest;
      buffer = ""; // reset for next message

      // Handle initialize: respond with capabilities THEN handle notification inline
      if (req.method === "initialize") {
        const params = req.params as Record<string, unknown> | undefined;
        const rootUri = (params?.rootUri as string | undefined) ?? null;
        checkSessionBoundary(rootUri);

        const initResponse = {
          jsonrpc: "2.0" as const,
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "contextfs", version: "1.0.0" },
          },
        };
        process.stdout.write(JSON.stringify(initResponse) + "\n");
        resetSessionState(); // equivalent to notifications/initialized
        continue;
      }

      const res = await handleRequest(req);
      if (res.id !== null) {
        process.stdout.write(JSON.stringify(res) + "\n");
      }
    } catch (err) {
      console.error("[contextfs mcp] Error:", err);
      buffer = ""; // reset on error
    }
  }
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────────

export async function runMCP(): Promise<void> {
  // Wait for client to send initialize, then respond with capabilities
  // This ensures correct MCP protocol sequence
  await messageLoop();
}
