import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";

export interface SessionSummary {
  session_summary: string;
  decision_map: Record<string, { action: string; reason: string }>;
  open_questions: string[];
  next_steps: string[];
  generated_at: string;
  context_before_compact: number;
}

// ── LLM Text Summarizer ─────────────────────────────────────────────────────────

async function summarizeText(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    return `[MOCK] ${prompt.slice(0, 100)}`;
  }

  try {
    const { Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
    return textBlock ? textBlock.text.trim() : "";
  } catch {
    return `[MOCK] ${prompt.slice(0, 100)}`;
  }
}

// ── Core Compactor ───────────────────────────────────────────────────────────────

async function compactConversation(conversationText: string): Promise<SessionSummary> {
  // Extract key patterns from conversation
  const filesMentioned = extractFileMentions(conversationText);
  const decisions = extractDecisions(conversationText);
  const questions = extractQuestions(conversationText);
  const actions = extractActions(conversationText);

  // Generate a summary of the full conversation
  const summaryPrompt = `Summarize this coding session concisely:

Files worked on: ${filesMentioned.join(", ") || "none"}
Decisions made: ${decisions.join("; ") || "none"}
Open questions: ${questions.join("; ") || "none"}

Session transcript (truncated):
${conversationText.slice(0, 8000)}

Provide a 3-4 sentence summary of what was accomplished.`;

  const sessionSummary = await summarizeText(summaryPrompt);

  return {
    session_summary: sessionSummary,
    decision_map: decisions.reduce((acc, d) => {
      acc[d] = { action: "decided", reason: "agreed during session" };
      return acc;
    }, {} as Record<string, { action: string; reason: string }>),
    open_questions: questions.slice(0, 5),
    next_steps: actions.slice(0, 5),
    generated_at: new Date().toISOString(),
    context_before_compact: conversationText.length,
  };
}

// ── Extractors ─────────────────────────────────────────────────────────────────

function extractFileMentions(text: string): string[] {
  const filePattern = /[\w./]+\.(ts|tsx|js|jsx|py|json|md|html|css)\b/g;
  const matches = text.match(filePattern) || [];
  return [...new Set(matches)].slice(0, 20);
}

function extractDecisions(text: string): string[] {
  const patterns = [
    /(?:decided|chose|opted|agreed|concluded|determined)[:@](.+)/gi,
    /(?:we'll|I'll|let's go with|going with) ([^.\n]+)/gi,
    /(?:use|using|implement|build) ([^.\n]+?) (?:instead|rather)/gi,
  ];
  const results: string[] = [];
  for (const p of patterns) {
    const m = text.matchAll(p);
    for (const match of m) {
      if (match[1]) results.push(match[1].trim().slice(0, 100));
    }
  }
  return results.slice(0, 10);
}

function extractQuestions(text: string): string[] {
  const pattern = /(?:what about|how do|can we|could we|should we|why not|I wonder|need to|unclear|tbd) ([^?\n]+)/gi;
  const matches = text.matchAll(pattern);
  const results: string[] = [];
  for (const m of matches) {
    if (m[1]) results.push(m[1].trim().slice(0, 100));
  }
  return results.slice(0, 5);
}

function extractActions(text: string): string[] {
  const pattern = /(?:created|modified|updated|deleted|added|built|implemented|fixed|changed) ([^.\n]+)/gi;
  const matches = text.matchAll(pattern);
  const results: string[] = [];
  for (const m of matches) {
    if (m[1]) results.push(m[1].trim().slice(0, 100));
  }
  return results.slice(0, 5);
}

// ── Session File Detection ───────────────────────────────────────────────────────

function detectSessionFiles(): string[] {
  const candidates = [
    path.join(os.homedir(), ".claude", "sessions"),
    path.join(os.homedir(), ".claude", "history"),
  ];
  const files: string[] = [];
  for (const dir of candidates) {
    try {
      const entries = fsSync.readdirSync(dir);
      for (const entry of entries.slice(-5)) {
        files.push(path.join(dir, entry));
      }
    } catch { /* skip */ }
  }
  return files;
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────────

export async function runCompact(args: {
  sessionPath?: string;
  rootDir?: string;
} = {}): Promise<void> {
  const { sessionPath, rootDir = process.cwd() } = args;

  let conversationText = "";

  if (sessionPath) {
    // Read specific session file
    try {
      conversationText = await fs.readFile(sessionPath, "utf-8");
    } catch {
      console.error(`Error: Cannot read session file: ${sessionPath}`);
      process.exit(1);
    }
  } else {
    // Try to detect session files
    const sessionFiles = detectSessionFiles();
    if (sessionFiles.length === 0) {
      // Fall back to reading from stdin
      console.error("No session files detected. Reading from stdin...");
      const chunks: string[] = [];
      let hasInput = false;
      let resolveReady: () => void;
      process.stdin.on("data", (c) => {
        hasInput = true;
        chunks.push(c.toString());
      });
      process.stdin.on("end", () => resolveReady?.());
      await new Promise<void>((resolve) => {
        resolveReady = resolve;
        // Only time out if we haven't received any data yet
        setTimeout(() => {
          if (hasInput) return; // data already ended naturally
          resolve();
        }, 1000);
      });
      conversationText = chunks.join("");
    } else {
      // Read most recent session
      conversationText = await fs.readFile(sessionFiles[sessionFiles.length - 1], "utf-8");
    }
  }

  if (!conversationText.trim()) {
    console.error("No conversation content found.");
    process.exit(1);
  }

  console.error(`[contextfs compact] Compacting ${conversationText.length} chars of conversation...`);

  const summary = await compactConversation(conversationText);

  const outputPath = path.join(rootDir, "session-summary.json");
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2), "utf-8");

  console.error(`[contextfs compact] Summary written to: ${outputPath}`);
  console.error(`[contextfs compact] Before: ${summary.context_before_compact} chars`);
  console.error(`[contextfs compact] Summary: ${summary.session_summary.slice(0, 100)}...`);
}
