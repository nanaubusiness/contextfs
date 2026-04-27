#!/usr/bin/env node

/**
 * ContextFS Session Compactor Tests
 *
 * Tests the contextfs compact CLI command using real session files.
 * No API key needed — falls back to [MOCK] prefix when ANTHROPIC_API_KEY is not set.
 *
 * Usage:
 *   npx tsx test/compact-test.ts
 */

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Mock conversation fixtures ──────────────────────────────────────────────────

const SESSION_FIXTURE = `You: We need to build the auth system for this project
Assistant: I'll set up JWT-based authentication
You: Sounds good, let's go with TypeScript then
Assistant: Created src/auth/login.ts with login handler
You: What about session management?
Assistant: I'll add session tokens. We should use Redis instead of in-memory storage
You: Good idea. I also need to add rate limiting
Assistant: Should we use Redis or an in-memory cache for the rate limiter?
You: Let's use Redis, it's more scalable
Assistant: Implemented src/auth/rate-limiter.ts using Redis
You: We also need a user repository
Assistant: Built src/db/user.repository.ts for user data access
You: Can we add email verification?
Assistant: What about using SendGrid for emails?
You: Sure, let's use SendGrid
Assistant: Added email verification in src/auth/email.ts
You: We should also add password reset
Assistant: Created src/auth/password-reset.ts
You: How do we handle CORS?
Assistant: Should we configure it per-domain or use a wildcard?
You: Per-domain is safer
Assistant: Updated src/middleware/cors.ts with per-domain config
You: What about logging?
Assistant: We need to add structured logging
You: I want to use Winston
Assistant: Configured Winston in src/utils/logger.ts
You: Good, let's ship it
Assistant: Ready to deploy!`;

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

async function runCompact(sessionFile: string, rootDir: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(os.homedir() + "/.local/bin/contextfs", ["compact", "--session", sessionFile, "--root", rootDir], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c) => (stdout += c.toString()));
    proc.stderr?.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code || 0 }));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  const results: TestResult[] = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contextfs-compact-test-"));

  console.log("\n" + "═".repeat(80));
  console.log("  ContextFS Session Compactor Tests");
  console.log(`  Temp dir: ${tempDir}`);
  console.log("═".repeat(80));

  // Write session file
  const sessionFile = path.join(tempDir, "session.txt");
  await fs.writeFile(sessionFile, SESSION_FIXTURE, "utf-8");

  // ── Test 1: compact runs successfully ─────────────────────────────────────
  {
    const { code, stderr } = await runCompact(sessionFile, tempDir);
    if (code === 0) {
      results.push(pass("compact: exits with code 0"));
    } else {
      results.push(fail("compact: exits with code 0", `Exit code: ${code}, stderr: ${stderr}`));
    }
  }

  // ── Test 2: session-summary.json is created ───────────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    try {
      const content = await fs.readFile(outputPath, "utf-8");
      const parsed = JSON.parse(content);
      results.push(pass("compact: creates session-summary.json"));
    } catch {
      results.push(fail("compact: creates session-summary.json", "File not found or invalid JSON"));
    }
  }

  // ── Test 3: output has all required fields ────────────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    const hasAllFields =
      typeof summary.session_summary === "string" &&
      typeof summary.decision_map === "object" &&
      Array.isArray(summary.open_questions) &&
      Array.isArray(summary.next_steps) &&
      typeof summary.generated_at === "string" &&
      typeof summary.context_before_compact === "number";
    if (hasAllFields) {
      results.push(pass("compact: all required fields present"));
    } else {
      results.push(fail("compact: all required fields", `Missing: ${JSON.stringify(summary)}`));
    }
  }

  // ── Test 4: session_summary is non-trivial ────────────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    if (summary.session_summary.length > 10) {
      results.push(pass("compact: session_summary is non-trivial"));
    } else {
      results.push(fail("compact: session_summary non-trivial", `Too short: ${summary.session_summary}`));
    }
  }

  // ── Test 5: decision_map contains mentioned files ─────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    const files = Object.keys(summary.decision_map);
    const hasAuth = files.some((f) => f.includes("auth"));
    const hasDb = files.some((f) => f.includes("db"));
    if (hasAuth && hasDb) {
      results.push(pass("compact: decision_map contains mentioned files"));
    } else {
      results.push(fail("compact: decision_map", `Expected auth+db files, got: ${JSON.stringify(files)}`));
    }
  }

  // ── Test 6: open_questions extracted ─────────────────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    if (summary.open_questions.length > 0) {
      results.push(pass("compact: open_questions extracted"));
    } else {
      results.push(fail("compact: open_questions", `Empty: ${JSON.stringify(summary.open_questions)}`));
    }
  }

  // ── Test 7: next_steps extracted ─────────────────────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    if (summary.next_steps.length > 0) {
      results.push(pass("compact: next_steps extracted"));
    } else {
      results.push(fail("compact: next_steps", `Empty: ${JSON.stringify(summary.next_steps)}`));
    }
  }

  // ── Test 8: context_before_compact matches input ────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    if (summary.context_before_compact === SESSION_FIXTURE.length) {
      results.push(pass("compact: context_before_compact matches input length"));
    } else {
      results.push(fail("compact: context_before_compact", `Expected ${SESSION_FIXTURE.length}, got ${summary.context_before_compact}`));
    }
  }

  // ── Test 9: generated_at is valid ISO date ───────────────────────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    const isValid = !isNaN(Date.parse(summary.generated_at));
    if (isValid) {
      results.push(pass("compact: generated_at is valid ISO date"));
    } else {
      results.push(fail("compact: generated_at", `Invalid: ${summary.generated_at}`));
    }
  }

  // ── Test 10: token savings (real LLM only, skip in mock mode) ─────────────
  {
    const outputPath = path.join(tempDir, "session-summary.json");
    const content = await fs.readFile(outputPath, "utf-8");
    const summary = JSON.parse(content);
    const summarySize = JSON.stringify(summary).length;
    const ratio = summarySize / SESSION_FIXTURE.length;
    const savings = ((1 - ratio) * 100).toFixed(1);
    // Mock mode: summarizer returns [MOCK] + prompt truncated to 100 chars (plus JSON overhead)
    // so savings aren't meaningful. Only test savings when real LLM is used.
    if (summary.session_summary.startsWith("[MOCK]")) {
      results.push(pass(`compact: mock mode active (real LLM needed for savings test)`));
    } else if (ratio < 0.5) {
      results.push(pass(`compact: token savings (${savings}% reduction)`));
    } else {
      results.push(fail("compact: token savings", `Summary is ${(ratio * 100).toFixed(1)}% of original`));
    }
  }

  // ── Test 11: non-existent session file ───────────────────────────────────
  {
    const { code } = await runCompact("/nonexistent/file.txt", tempDir);
    if (code !== 0) {
      results.push(pass("compact: exits non-zero for missing session file"));
    } else {
      results.push(fail("compact: exits non-zero for missing session file", "Should have exited with error"));
    }
  }

  // ── Test 12: reads session_summary from stderr ────────────────────────────
  {
    const { stderr } = await runCompact(sessionFile, tempDir);
    if (stderr.includes("Compacting") && stderr.includes("Summary written")) {
      results.push(pass("compact: stderr shows progress"));
    } else {
      results.push(fail("compact: stderr shows progress", `Missing progress output: ${stderr}`));
    }
  }

  // ── Clean up ──────────────────────────────────────────────────────────────
  await fs.rm(tempDir, { recursive: true });

  // ── Print results ─────────────────────────────────────────────────────────
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
