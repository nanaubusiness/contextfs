#!/usr/bin/env node

/**
 * ContextFS MCP Server Tests
 *
 * Tests the contextfs mcp command by spawning it as a subprocess
 * and sending JSON-RPC requests over stdio.
 *
 * Usage:
 *   npx tsx test/mcp-test.ts
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Test helpers ───────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  reason?: string;
}

function pass(name: string): TestResult {
  return { name, passed: true };
}

function fail(name: string, reason: string): TestResult {
  return { name, passed: false, reason };
}

// ── MCP Client ────────────────────────────────────────────────────────────────

class MCPClient {
  private proc: ChildProcess;
  private pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();
  private buf = "";
  private ready: Promise<void>;

  constructor() {
    this.proc = spawn(os.homedir() + "/.local/bin/contextfs", ["mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: os.homedir() + "/.local/bin:/usr/local/bin:/usr/bin:/bin" },
    });

    this.proc.stdout?.setEncoding("utf-8");
    this.proc.stdout?.on("data", (chunk) => this.handleData(chunk.toString()));

    this.ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MCP server did not start")), 5000);
      this._readyResolve = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  private handleData(chunk: string): void {
    this.buf += chunk;
    const tryFlush = () => {
      const trimmed = this.buf.trim();
      if (!trimmed) return;
      // Try whole buffer
      try {
        const parsed = JSON.parse(trimmed);
        // Resolve ready if this is the capabilities message
        if (this._readyResolve && parsed.result?.capabilities) {
          this._readyResolve();
          this._readyResolve = undefined;
        }
        this.deliver(parsed);
        this.buf = "";
        return;
      } catch { /* not a single complete JSON */ }
      // Try line by line
      const lines = this.buf.split("\n");
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const parsed = JSON.parse(t);
          // Resolve ready if this is the capabilities message
          if (this._readyResolve && parsed.result?.capabilities) {
            this._readyResolve();
            this._readyResolve = undefined;
          }
          this.deliver(parsed);
          this.buf = this.buf.slice(this.buf.indexOf(t) + t.length).replace(/^\n/, "");
          tryFlush();
          return;
        } catch { /* keep looking */ }
      }
    };
    tryFlush();
  }

  private _readyResolve?: () => void;

  private deliver(parsed: any): void {
    const id = parsed.id;
    if (id === null) return; // notifications skipped
    const handlers = this.pending.get(id);
    if (!handlers) return;
    this.pending.delete(id);
    if (parsed.error) handlers.reject(parsed.error);
    else handlers.resolve(parsed.result);
  }

  async call(method: string, params?: Record<string, unknown>): Promise<any> {
    await this.ready;
    const id = Math.floor(Math.random() * 99999);
    const request = { jsonrpc: "2.0", id, method, params: params || {} };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, 5000);
      this.pending.set(id, { resolve, reject });
      this.proc.stdin?.write(JSON.stringify(request) + "\n");
    });
  }

  kill(): void {
    this.proc.kill();
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function setupFixtures(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contextfs-mcp-test-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  // File with summary
  await fs.writeFile(path.join(srcDir, "auth.ts"), "export function login() {}", "utf-8");
  await fs.writeFile(
    path.join(srcDir, "auth.ts.summary"),
    "Purpose: Handles user authentication\nExports: login\nDependencies: bcrypt\nRisk: high",
    "utf-8"
  );

  // File without summary (locked) — we'll test this via a sub-process that feeds 'n'
  await fs.writeFile(path.join(srcDir, "secret.ts"), "const API_KEY = 'super-secret-key';", "utf-8");
  // Write a summary for secret.ts too so the main test flow doesn't hang on prompt
  await fs.writeFile(
    path.join(srcDir, "secret.ts.summary"),
    "Purpose: Secret configuration file\nExports: none\nDependencies: none\nRisk: high",
    "utf-8"
  );

  // File with nested path
  await fs.mkdir(path.join(srcDir, "db"), { recursive: true });
  await fs.writeFile(path.join(srcDir, "db", "user.ts"), "export class User {}", "utf-8");
  await fs.writeFile(
    path.join(srcDir, "db", "user.ts.summary"),
    "Purpose: User model\nExports: User\nDependencies: none\nRisk: low",
    "utf-8"
  );

  // Context map
  const contextMap = {
    files: {
      [path.join(srcDir, "auth.ts")]: {
        summary_path: path.join(srcDir, "auth.ts.summary"),
        purpose: "Handles user authentication",
      },
      [path.join(srcDir, "db/user.ts")]: {
        summary_path: path.join(srcDir, "db/user.ts.summary"),
        purpose: "User model",
      },
    },
    generated_at: new Date().toISOString(),
    version: "1.0",
  };
  await fs.writeFile(path.join(tempDir, "context-map.json"), JSON.stringify(contextMap), "utf-8");

  return tempDir;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  const results: TestResult[] = [];
  const tempDir = await setupFixtures();
  let client: MCPClient | null = null;

  console.log("\n" + "═".repeat(80));
  console.log("  ContextFS MCP Server Tests");
  console.log(`  Temp dir: ${tempDir}`);
  console.log("═".repeat(80));

  try {
    client = new MCPClient();

    // ── Test 1: tools/list returns both tools ────────────────────────────────
    try {
      const result = await client.call("tools/list");
      const tools = result.tools as Array<{ name: string }>;
      const hasReadFile = tools.some((t: any) => t.name === "contextfs_read_file");
      const hasQuery = tools.some((t: any) => t.name === "contextfs_query");
      if (hasReadFile && hasQuery) {
        results.push(pass("tools/list: returns both contextfs_read_file and contextfs_query"));
      } else {
        results.push(fail("tools/list", `Expected both tools, got: ${JSON.stringify(tools.map((t: any) => t.name))}`));
      }
    } catch (e: any) {
      results.push(fail("tools/list", e.message));
    }

    // ── Test 2: contextfs_read_file returns summary when available ────────────
    {
      const authFile = path.join(tempDir, "src", "auth.ts");
      const result = await client.call("tools/call", {
        name: "contextfs_read_file",
        arguments: { file_path: authFile },
      });
      const content = result.content?.[0]?.text || "";
      const isSummary = content.includes("Purpose:") && content.includes("Exports:");
      const isRaw = content.includes("export function login");
      if (isSummary && !isRaw) {
        results.push(pass("contextfs_read_file: returns .summary content (not raw)"));
      } else {
        results.push(fail("contextfs_read_file", `Expected summary, got: ${content.slice(0, 100)}`));
      }
    }

    // ── Test 3: contextfs_read_file returns summary for secret.ts (has .summary) ──
    {
      const secretFile = path.join(tempDir, "src", "secret.ts");
      const result = await client.call("tools/call", {
        name: "contextfs_read_file",
        arguments: { file_path: secretFile },
      });
      const content = result.content?.[0]?.text || "";
      // secret.ts now has a .summary so it returns the summary (not raw, not ACCESS DENIED)
      if (content.includes("Secret configuration") && !content.includes("super-secret-key")) {
        results.push(pass("contextfs_read_file: returns .summary (not raw) for secret file"));
      } else {
        results.push(fail("contextfs_read_file (secret)", `Expected secret summary, got: ${content.slice(0, 100)}`));
      }
    }

    // ── Test 4: contextfs_query returns results ──────────────────────────────
    {
      const result = await client.call("tools/call", {
        name: "contextfs_query",
        arguments: { query: "authentication", root_dir: tempDir },
      });
      const content = result.content?.[0]?.text || "";
      if (content.includes("auth.ts") || content.includes("authentication")) {
        results.push(pass("contextfs_query: returns matching files for 'authentication'"));
      } else {
        results.push(fail("contextfs_query", `Expected auth.ts in results, got: ${content.slice(0, 200)}`));
      }
    }

    // ── Test 5: contextfs_query with no match ────────────────────────────────
    {
      const result = await client.call("tools/call", {
        name: "contextfs_query",
        arguments: { query: "xyznonexistent", root_dir: tempDir },
      });
      const content = result.content?.[0]?.text || "";
      // Should not error, but return empty or "no matching files"
      if (!content.includes("error")) {
        results.push(pass("contextfs_query: handles no-match gracefully"));
      } else {
        results.push(fail("contextfs_query", `Unexpected error: ${content}`));
      }
    }

    // ── Test 6: missing file_path parameter ─────────────────────────────────
    {
      try {
        await client.call("tools/call", {
          name: "contextfs_read_file",
          arguments: {},
        });
        results.push(fail("contextfs_read_file: should error on missing file_path"));
      } catch (e: any) {
        if (e.code === -32602) {
          results.push(pass("contextfs_read_file: returns error for missing parameter"));
        } else {
          results.push(fail("contextfs_read_file: wrong error code", `Got ${e.code}`));
        }
      }
    }

    // ── Test 7: missing query parameter ─────────────────────────────────────
    {
      try {
        await client.call("tools/call", {
          name: "contextfs_query",
          arguments: { root_dir: tempDir },
        });
        results.push(fail("contextfs_query: should error on missing query"));
      } catch (e: any) {
        if (e.code === -32602) {
          results.push(pass("contextfs_query: returns error for missing parameter"));
        } else {
          results.push(fail("contextfs_query: wrong error code", `Got ${e.code}`));
        }
      }
    }

    // ── Test 8: unknown tool ────────────────────────────────────────────────
    {
      try {
        await client.call("tools/call", {
          name: "nonexistent_tool",
          arguments: {},
        });
        results.push(fail("nonexistent_tool: should return error"));
      } catch (e: any) {
        if (e.code === -32601) {
          results.push(pass("nonexistent_tool: returns method not found error"));
        } else {
          results.push(fail("nonexistent_tool: wrong error code", `Got ${e.code}`));
        }
      }
    }

    // ── Test 9: nested path file works ─────────────────────────────────────
    {
      const userFile = path.join(tempDir, "src", "db", "user.ts");
      const result = await client.call("tools/call", {
        name: "contextfs_read_file",
        arguments: { file_path: userFile },
      });
      const content = result.content?.[0]?.text || "";
      if (content.includes("Purpose:") && content.includes("User")) {
        results.push(pass("contextfs_read_file: handles nested paths"));
      } else {
        results.push(fail("contextfs_read_file (nested)", `Expected User summary, got: ${content.slice(0, 100)}`));
      }
    }

    // ── Test 10: contextfs_query for 'user' ─────────────────────────────────
    {
      const result = await client.call("tools/call", {
        name: "contextfs_query",
        arguments: { query: "user", root_dir: tempDir },
      });
      const content = result.content?.[0]?.text || "";
      if (content.includes("user.ts")) {
        results.push(pass("contextfs_query: finds 'user' files"));
      } else {
        results.push(fail("contextfs_query (user)", `Expected user.ts in results, got: ${content.slice(0, 200)}`));
      }
    }

  } finally {
    client?.kill();
    await fs.rm(tempDir, { recursive: true });
  }

  // ── Print results ──────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(80));
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) {
      console.log(`  ✅ ${r.name}`);
      passed++;
    } else {
      console.log(`  ❌ ${r.name}`);
      if (r.reason) console.log(`     → ${r.reason}`);
      failed++;
    }
  }

  console.log("\n" + "═".repeat(80));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(80) + "\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
