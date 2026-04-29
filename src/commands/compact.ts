import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const SUMMARIES_DIR = path.join(os.homedir(), ".claude", "sessions", "summaries");

// ─── SessionSummary Type ──────────────────────────────────────────────────────

export interface SessionSummary {
  project: string;
  session_id: string;
  generated_at: string;
  summary: string;
  decisions: string[];
  open_questions: string[];
  next_steps: string[];
  projects_affected: string[];
  files_discussed: string[];
  transcript_chars: number;
  entry_count: number;
}

// ─── LLM Summarizer ──────────────────────────────────────────────────────────

async function summarizeWithLLM(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  if (!apiKey) {
    return mockSummary(text);
  }

  try {
    const { Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-7-20250124",
      max_tokens: 1024,
      messages: [{ role: "user", content: buildSummaryPrompt(text) }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock ? (textBlock as { type: "text"; text: string }).text.trim() : "";
  } catch {
    return mockSummary(text);
  }
}

function buildSummaryPrompt(transcript: string): string {
  return `You are Aboud's executive assistant second brain. Summarize this coding session concisely.

Return a JSON object (no markdown, no extra text):
{
  "summary": "2-3 sentence summary of what was accomplished",
  "decisions": ["key decision made", ...],
  "open_questions": ["unresolved question", ...],
  "next_steps": ["action item", ...],
  "projects_affected": ["clipcoach", "plinkatin", "trading", "bug-bounty", ...],
  "files_discussed": ["path/to/file.ext", ...]
}

TRANSCRIPT:
${transcript.slice(0, 60000)}
`.trim();
}

function mockSummary(text: string): string {
  const lines = text.split("\n").filter(Boolean);
  return `[MOCK] ${lines.length} lines of conversation. Set ANTHROPIC_API_KEY for real summaries.`;
}

// ─── Transcript Parsing ────────────────────────────────────────────────────────

interface TranscriptEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

function extractMessageContent(entry: Record<string, unknown>): string {
  const msg = entry["message"];

  // message is already an object: {"role": "user", "content": "..."}
  if (typeof msg === "object" && msg !== null && !Array.isArray(msg)) {
    const msgObj = msg as Record<string, unknown>;
    const content = msgObj["content"];
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((c: unknown) => (c as { type?: string; text?: string })?.type === "text" ? (c as { text: string }).text : "")
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }

  // message is a JSON string
  if (typeof msg === "string") {
    try {
      const parsed = JSON.parse(msg);
      if (typeof parsed === "object" && parsed !== null) {
        const content = (parsed as Record<string, unknown>)["content"];
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          return (content as unknown[])
            .map((c: unknown) => (c as { type?: string; text?: string })?.type === "text" ? (c as { text: string }).text : "")
            .filter(Boolean)
            .join("\n");
        }
      }
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      return msg.slice(0, 500);
    }
  }

  return "";
}

function parseTranscript(jsonlPath: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  try {
    const content = fsSync.readFileSync(jsonlPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const type = entry["type"] as string;

        if (type === "user") {
          const content2 = extractMessageContent(entry);
          if (content2.trim()) {
            entries.push({ role: "user", content: content2, timestamp: entry["timestamp"] as string | undefined });
          }
        } else if (type === "assistant" || type === "result") {
          // response is a string; message might be an object
          const raw = entry["response"] ?? entry["message"] ?? "";
          let content2 = "";
          if (typeof raw === "string") {
            content2 = raw;
          } else if (typeof raw === "object" && raw !== null) {
            const rawObj = raw as Record<string, unknown>;
            const c = rawObj["content"];
            if (typeof c === "string") content2 = c;
            else if (Array.isArray(c)) {
              content2 = (c as unknown[])
                .map((item: unknown) => (item as { type?: string; text?: string })?.type === "text" ? (item as { text: string }).text : "")
                .filter(Boolean)
                .join("\n");
            }
          }
          if (content2.trim()) {
            entries.push({ role: "assistant", content: content2.slice(0, 10000), timestamp: entry["timestamp"] as string | undefined });
          }
        } else if (type !== undefined) {
          // Log unknown entry type so we know what Claude Code is emitting
          console.error(`[contextfs compact] Unknown transcript entry type: "${type}" — skipping`);
          // response is a string; message might be an object
          const raw = entry["response"] ?? entry["message"] ?? "";
          let content2 = "";
          if (typeof raw === "string") {
            content2 = raw;
          } else if (typeof raw === "object" && raw !== null) {
            const rawObj = raw as Record<string, unknown>;
            const c = rawObj["content"];
            if (typeof c === "string") content2 = c;
            else if (Array.isArray(c)) {
              content2 = (c as unknown[])
                .map((item: unknown) => (item as { type?: string; text?: string })?.type === "text" ? (item as { text: string }).text : "")
                .filter(Boolean)
                .join("\n");
            }
          }
          if (content2.trim()) {
            entries.push({ role: "assistant", content: content2.slice(0, 2000), timestamp: entry["timestamp"] as string | undefined });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File not found or unreadable
  }

  return entries;
}

function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const prefix = e.role === "user" ? "USER:" : "ASSISTANT:";
      return `${prefix} ${e.content}`;
    })
    .join("\n\n");
}

// ─── Summary Persistence ──────────────────────────────────────────────────────

function projectToSlug(projectPath: string): string {
  // Claude Code stores projects in folders named by encoding the path:
  // /Users/admin/Downloads/Executive Assistant → -Users-admin-Downloads-Executive-Assistant
  // Slashes become hyphens, spaces become hyphens, leading slash becomes a hyphen
  // Remove .. sequences to prevent path traversal attacks
  return projectPath.replace(/\//g, "-").replace(/ /g, "-").replace(/^-/, "-").replace(/\.\./g, "-");
}

function getSummaryPath(projectPath: string): string {
  const slug = projectToSlug(projectPath);
  return path.join(SUMMARIES_DIR, slug, "latest.json");
}

// ─── Compact Core ─────────────────────────────────────────────────────────────

export async function runCompact(args: {
  transcriptPath?: string;
  rootDir?: string;
  sessionId?: string;
  projectPath?: string;
} = {}): Promise<void> {
  const { sessionId, projectPath, rootDir = process.cwd() } = args;

  // If stdin has hook JSON, read it (PreCompact hook passes session_id, transcript_path, cwd via stdin)
  let hookInput: Record<string, unknown> | null = null;
  if (!process.stdin.isTTY) {
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk.toString());
    }
    const stdinContent = chunks.join("");
    if (stdinContent.trim()) {
      try {
        hookInput = JSON.parse(stdinContent);
      } catch {
        // Not JSON, ignore
      }
    }
  }

  // Resolve from args or PreCompact hook stdin:
  // PreCompact provides: session_id, transcript_path (direct path to JSONL!), cwd
  const resolvedSessionId = sessionId ?? (hookInput?.session_id as string | undefined) ?? null;
  const resolvedTranscriptPath = args.transcriptPath ?? (hookInput?.transcript_path as string | undefined) ?? null;
  const resolvedProject = projectPath ?? (hookInput?.cwd as string | undefined) ?? rootDir;

  if (!resolvedSessionId) {
    console.error("[contextfs compact] No session ID. Use --session-id or run via PreCompact hook.");
    throw new Error("No session ID provided");
  }

  console.error(`[contextfs compact] Session: ${resolvedSessionId}`);
  console.error(`[contextfs compact] Project: ${resolvedProject}`);
  if (resolvedTranscriptPath) {
    console.error(`[contextfs compact] Transcript: ${resolvedTranscriptPath}`);
  }

  // Parse transcript — path is provided directly by PreCompact hook
  let transcriptEntries: TranscriptEntry[] = [];
  if (resolvedTranscriptPath) {
    transcriptEntries = parseTranscript(resolvedTranscriptPath);
  } else {
    console.error("[contextfs compact] Warning: no transcript_path provided (not called via PreCompact hook?).");
  }

  console.error(`[contextfs compact] Extracted ${transcriptEntries.length} transcript entries`);

  const transcriptText = formatTranscript(transcriptEntries);

  if (!transcriptText.trim()) {
    console.error("[contextfs compact] No transcript content found.");
    return;
  }

  // Generate summary
  console.error("[contextfs compact] Generating summary...");
  const rawSummary = await summarizeWithLLM(transcriptText);

  // Parse JSON response — try direct parse, then strip markdown code blocks
  let parsedSummary: Partial<SessionSummary> = {};
  try {
    parsedSummary = JSON.parse(rawSummary);
  } catch {
    // Try stripping markdown code blocks that LLM sometimes wraps around JSON
    const stripped = rawSummary.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      parsedSummary = JSON.parse(stripped);
    } catch {
      console.error("[contextfs compact] LLM response was not valid JSON — summary may be incomplete.");
      parsedSummary = {
        summary: rawSummary.slice(0, 300),
        decisions: [],
        open_questions: [],
        next_steps: [],
        projects_affected: [],
        files_discussed: [],
      };
    }
  }

  const sessionSummary: SessionSummary = {
    project: resolvedProject,
    session_id: resolvedSessionId,
    generated_at: new Date().toISOString(),
    summary: parsedSummary.summary ?? rawSummary,
    decisions: parsedSummary.decisions ?? [],
    open_questions: parsedSummary.open_questions ?? [],
    next_steps: parsedSummary.next_steps ?? [],
    projects_affected: parsedSummary.projects_affected ?? [],
    files_discussed: parsedSummary.files_discussed ?? [],
    transcript_chars: transcriptText.length,
    entry_count: transcriptEntries.length,
  };

  // Write last-compact marker FIRST so crash recovery can't find summary without marker
  const markerPath = path.join(os.homedir(), ".claude", "sessions", "last-compact.json");
  const summaryPath = getSummaryPath(resolvedProject);
  const lockPath = summaryPath + ".lock";
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });

  // Acquire exclusive lock to prevent concurrent PreCompact writes
  let lockFd: fsSync.promises.FileHandle | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      lockFd = await fsSync.promises.open(lockPath, "wx");
      break; // Got lock
    } catch (err: any) {
      if (err.code === "EEXIST") {
        // Another process holds the lock — wait and retry
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err; // Unexpected error
    }
  }
  if (!lockFd) {
    throw new Error(`[contextfs compact] Could not acquire lock after 10 attempts: ${lockPath}`);
  }

  try {
    await fs.writeFile(
      markerPath,
      JSON.stringify({ sessionId: resolvedSessionId, project: resolvedProject, summaryPath, generatedAt: new Date().toISOString() }),
      "utf-8"
    );

    // Write summary to stable location
    await fs.writeFile(summaryPath, JSON.stringify(sessionSummary, null, 2), "utf-8");

    console.error(`[contextfs compact] Written: ${summaryPath}`);
    console.error(`[contextfs compact] Before: ${sessionSummary.transcript_chars} chars → Summary: ${rawSummary.length} chars`);
    console.error(`[contextfs compact] Projects: ${sessionSummary.projects_affected.join(", ") || "none"}`);
    console.error(`[contextfs compact] Summary: ${sessionSummary.summary.slice(0, 120)}...`);
  } finally {
    await lockFd.close();
    await fs.unlink(lockPath).catch((err) => {
      console.error(`[contextfs compact] Warning: failed to release lock ${lockPath}: ${err}`);
    });
  }
}

// ─── Session Resume ────────────────────────────────────────────────────────────

export async function runSessionResume(args: { projectPath?: string } = {}): Promise<string> {
  let { projectPath = process.cwd() } = args;

  // SessionStart hook passes cwd in stdin JSON
  if (!process.stdin.isTTY) {
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk.toString());
    }
    const stdinContent = chunks.join("");
    if (stdinContent.trim()) {
      try {
        const hookInput = JSON.parse(stdinContent) as Record<string, unknown>;
        if (hookInput.cwd && typeof hookInput.cwd === "string") {
          projectPath = hookInput.cwd;
        }
      } catch {
        // Not JSON, ignore
      }
    }
  }

  const summaryPath = getSummaryPath(projectPath);

  try {
    const content = await fs.readFile(summaryPath, "utf-8");
    const summary: SessionSummary = JSON.parse(content);
    return formatSessionSummaryForContext(summary);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      // No previous session found — this is fine for first sessions
      return "";
    }
    console.error(`[contextfs compact] Warning: failed to read session summary: ${err}`);
    return "";
  }
}

function formatSessionSummaryForContext(summary: SessionSummary): string {
  const lines: string[] = [];
  lines.push("## Previous Session Summary");
  lines.push(`**Date:** ${new Date(summary.generated_at).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  lines.push(`**Projects:** ${summary.projects_affected.join(", ") || "unknown"}`);
  lines.push("");
  lines.push("### What Was Accomplished");
  lines.push(summary.summary);
  lines.push("");

  if (summary.decisions.length > 0) {
    lines.push("### Decisions Made");
    for (const d of summary.decisions) lines.push(`- ${d}`);
    lines.push("");
  }

  if (summary.open_questions.length > 0) {
    lines.push("### Open Questions");
    for (const q of summary.open_questions) lines.push(`- ${q}`);
    lines.push("");
  }

  if (summary.next_steps.length > 0) {
    lines.push("### Next Steps");
    for (const s of summary.next_steps) lines.push(`- ${s}`);
    lines.push("");
  }

  if (summary.files_discussed.length > 0) {
    lines.push("### Files Discussed");
    lines.push("```");
    lines.push(summary.files_discussed.join("\n"));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Context Files Build ────────────────────────────────────────────────────────

export async function runContextFilesBuild(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const contextDir = path.join(rootDir, "context");

  let entries: string[];
  try {
    entries = await fs.readdir(contextDir);
  } catch {
    console.error("[contextfs] No context/ directory found.");
    return;
  }

  const mdFiles = entries.filter((e) => e.endsWith(".md") && !e.endsWith(".summary.md"));

  if (mdFiles.length === 0) {
    console.error("[contextfs] No .md files found in context/.");
    return;
  }

  console.error(`[contextfs] Found ${mdFiles.length} context files to summarize`);

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  for (const file of mdFiles) {
    const filePath = path.join(contextDir, file);
    const summaryPath = `${filePath}.summary`;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);

      // Skip if unchanged
      try {
        const existing = await fs.readFile(summaryPath, "utf-8");
        const existingHash = existing.match(/hash:\s*([a-f0-9]+)/i)?.[1];
        if (existingHash === hash) {
          console.error(`[contextfs] Skipping (unchanged): ${file}`);
          continue;
        }
      } catch {
        // No existing summary
      }

      const summaryContent = await summarizeContextFile(content, file, apiKey);
      await fs.writeFile(summaryPath, `${summaryContent}\nhash: ${hash}`, "utf-8");
      console.error(`[contextfs] Summarized: ${file}`);
    } catch (err) {
      console.error(`[contextfs] Failed to process ${file}: ${err}`);
    }
  }
}

async function summarizeContextFile(
  content: string,
  filename: string,
  apiKey?: string
): Promise<string> {
  const purposeMap: Record<string, string> = {
    "me.md": "Personal context about Aboud (roles, priorities, work style)",
    "work.md": "Work context (ClipCoach, Plinkatin, trading, bug bounty)",
    "team.md": "Team context (Leen Kayali, Feras Kayali, communication style)",
    "current-priorities.md": "Current priorities and active workstreams",
    "goals.md": "Quarterly goals and longer-horizon intentions",
  };

  const purpose = purposeMap[filename] ?? `Context file: ${filename.replace(".md", "")}`;

  if (!apiKey) {
    return `Purpose: ${purpose}\nSummary: ${content.slice(0, 300)}\nRisk: low`;
  }

  try {
    const { Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-7-20250124",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Summarize this context file for an AI assistant (Aboud's executive second brain).

Respond with exactly this format (no JSON, no extra text):
Purpose: <one sentence>
Summary: <2-3 sentence overview>
Topics: <comma-separated key topics>

FILE: ${filename}
CONTENT:
${content.slice(0, 4000)}`,
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock ? (textBlock as { type: "text"; text: string }).text.trim() : "";
    return text || `Purpose: ${purpose}\nSummary: (unavailable)\nRisk: low`;
  } catch {
    return `Purpose: ${purpose}\nSummary: ${content.slice(0, 300)}\nRisk: low`;
  }
}
