import * as fs from "fs/promises";
import * as path from "path";
import { parseFile } from "../parser/index.js";
import { createLLMSummarizer } from "../summarizer/index.js";

const CHARS_PER_TOKEN = 4;

export async function runDemo(filePath: string): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("\n❌ ERROR: ANTHROPIC_API_KEY not set");
    console.error("\nUsage: ANTHROPIC_API_KEY=sk-... contextfs demo <file>");
    console.error("\nGet your API key from: https://console.minimax.io\n");
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, "utf-8");
  const parsed = await parseFile(absolutePath);

  const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);

  console.log("\n" + "═".repeat(80));
  console.log("  ContextFS DEMO");
  console.log("═".repeat(80));
  console.log(`\n📄 File: ${path.basename(absolutePath)}`);
  console.log(`📁 Path: ${absolutePath}`);
  console.log(`📊 Size: ${content.length} chars (~${rawTokens} tokens)\n`);

  console.log("─".repeat(80));
  console.log("  ORIGINAL FILE");
  console.log("─".repeat(80));
  console.log(content);

  console.log("\n" + "─".repeat(80));
  console.log("  SUMMARIZING WITH MINIMAX...");
  console.log("─".repeat(80) + "\n");

  const summarizer = await createLLMSummarizer(apiKey);
  const summary = await summarizer.summarize(parsed);
  const summaryTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
  const savings = ((rawTokens - summaryTokens) / rawTokens * 100).toFixed(1);

  console.log("─".repeat(80));
  console.log("  GENERATED SUMMARY");
  console.log("─".repeat(80));
  console.log(summary);

  console.log("\n" + "═".repeat(80));
  console.log("  RESULT");
  console.log("═".repeat(80));
  console.log(`
  Raw tokens:        ~${rawTokens}
  Summary tokens:    ~${summaryTokens}
  Token savings:     ${savings}%
  Cost without:      $${(rawTokens / 1_000_000 * 5).toFixed(4)}
  Cost with summary: $${(summaryTokens / 1_000_000 * 5).toFixed(4)}
  `);

  console.log("  The AI can understand this file from the summary alone.");
  console.log("  No need to read the full raw file every time.");
  console.log("═".repeat(80) + "\n");
}
