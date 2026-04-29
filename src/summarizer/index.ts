import * as os from "os";
import * as path from "path";
import { readFile } from "fs/promises";
import { ParsedFile } from "../types.js";

export function createMockSummarizer(): Summarizer {
  return {
    provider: "mock",
    model: "mock",
    async summarize(file: ParsedFile): Promise<string> {
      const filename = file.path.split("/").pop() ?? file.path;
      const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
      const purpose = file.exports.length > 0
        ? `Provides ${file.exports.slice(0, 5).join(", ")}`
        : `Source file: ${nameWithoutExt}`;
      const lines = [
        `Purpose: ${purpose}`,
        `Exports: ${file.exports.slice(0, 10).join(", ") || "none"}`,
        `Dependencies: ${file.dependencies.slice(0, 10).join(", ") || "none"}`,
      ];
      if (file.exports.length > 0) {
        lines.push("Core logic:");
        for (const exp of file.exports.slice(0, 5)) {
          lines.push(`  - ${exp}`);
        }
      }
      lines.push("Risk: low");
      return lines.join("\n");
    },
  };
}

export interface Summarizer {
  summarize(file: ParsedFile): Promise<string>;
  provider: string;
  model: string;
}

// Resolved API key — set once during detectProvider(), reused by createLLMSummarizer()
let _resolvedApiKey: string | undefined;

// ─── Provider Detection ────────────────────────────────────────────────────────

export async function detectProvider(): Promise<string> {
  // Already resolved — skip redundant work
  if (_resolvedApiKey) return "anthropic";

  // 1. Claude Code subscription token (no cost to you)
  try {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    if (settings.env?.ANTHROPIC_AUTH_TOKEN) {
      _resolvedApiKey = settings.env.ANTHROPIC_AUTH_TOKEN;
      console.log("[contextfs] Using Claude Code subscription (Claude Opus)");
      return "anthropic";
    }
  } catch {}

  // 2. Explicit ANTHROPIC_API_KEY
  if (process.env.ANTHROPIC_API_KEY) {
    _resolvedApiKey = process.env.ANTHROPIC_API_KEY;
    console.log("[contextfs] Using ANTHROPIC_API_KEY");
    return "anthropic";
  }

  throw new Error(
    "No Anthropic API key found. Set ANTHROPIC_API_KEY environment variable."
  );
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function anthropicChat(prompt: string, apiKey: string, maxRetries = 3): Promise<string> {
  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251101",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = response.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
      if (!textBlock) {
        console.warn("[contextfs] Empty response from API — no text block returned.");
        return "";
      }
      return textBlock.text.trim();
    } catch (err) {
      lastError = err;
      const delayMs = (attempt + 1) * 1000; // 1s, 2s, 3s backoff
      console.warn(`[contextfs] API call failed (attempt ${attempt + 1}/${maxRetries}): ${err}. Retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

// ─── Prompt template ─────────────────────────────────────────────────────────

const SUMMARY_PROMPT = `Analyze this code file. Respond with exactly this format (no JSON, no extra text):

Purpose: <one sentence>
Exports: <comma-separated list>
Dependencies: <comma-separated list>
Core logic:
  - <key behavior 1>
  - <key behavior 2>
Risk: <low|medium|high>

[CODE STARTS]
`;

const CODE_END_SENTINEL = "\n[CODE ENDS]";

function buildPrompt(file: ParsedFile): string {
  // Delimit code clearly to prevent prompt injection
  const codeContent = file.content.slice(0, 8000)
    .replace(/\[CODE STARTS\]/g, "[CODE STARTS WARNING]")
    .replace(/\[CODE ENDS\]/g, "[CODE ENDS WARNING]");
  return SUMMARY_PROMPT + codeContent + CODE_END_SENTINEL;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export async function createLLMSummarizer(): Promise<Summarizer> {
  const apiKey = _resolvedApiKey;
  if (!apiKey) {
    throw new Error("No Anthropic API key found. Set ANTHROPIC_API_KEY environment variable.");
  }

  return {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251101",
    async summarize(file: ParsedFile) {
      try {
        return await anthropicChat(buildPrompt(file), apiKey);
      } catch (err) {
        // Don't silently produce fake summaries — fail fast so the user knows
        console.error(`[contextfs] API call failed: ${err}. Set ANTHROPIC_API_KEY for real summaries.`);
        process.exit(1);
      }
    },
  };
}
