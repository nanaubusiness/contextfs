import * as fs from "fs/promises";
import * as path from "path";
import { parseFile } from "../parser/index.js";
import { createLLMSummarizer } from "../summarizer/index.js";

const CHARS_PER_TOKEN = 4;

export async function runDemo(filePath: string): Promise<void> {
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
  console.log("  SUMMARIZING...");
  console.log("─".repeat(80) + "\n");

  let summarizer;
  try {
    summarizer = await createLLMSummarizer();
  } catch (e: any) {
    console.error("\n❌ ERROR: " + e.message);
    console.error("\nTo fix, set up a free local model:");
    console.error("  brew install ollama && ollama pull qwen2.5:3b\n");
    process.exit(1);
  }

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
  Provider:         ${summarizer.provider} / ${summarizer.model}
  Raw tokens:       ~${rawTokens}
  Summary tokens:   ~${summaryTokens}
  Token savings:    ${savings}%
  `);

  console.log("  The AI can understand this file from the summary alone.");
  console.log("  No need to read the full raw file every time.");
  console.log("═".repeat(80) + "\n");
}
