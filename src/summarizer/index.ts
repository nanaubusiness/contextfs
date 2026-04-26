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
  // 1. Claude Code subscription token (no cost to you)
  try {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    if (settings.env?.ANTHROPIC_AUTH_TOKEN) {
      _resolvedApiKey = settings.env.ANTHROPIC_AUTH_TOKEN;
      console.log("[contextfs] Using Claude Code subscription (Anthropic Haiku)");
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

async function anthropicChat(prompt: string, apiKey: string): Promise<string> {
  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251101",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  return textBlock ? textBlock.text.trim() : "";
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

CODE:
`;

function buildPrompt(file: ParsedFile): string {
  return SUMMARY_PROMPT + file.content.slice(0, 8000);
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
      return anthropicChat(buildPrompt(file), apiKey);
    },
  };
}
