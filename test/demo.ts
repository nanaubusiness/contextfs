#!/usr/bin/env node

/**
 * ContextFS Quick Demo - Shows it working in 60 seconds
 *
 * Run this to see ContextFS summarize 5 real files with Claude Opus API.
 * No API key needed if ANTHROPIC_API_KEY is set in environment.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx test/demo.ts
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createLLMSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARS_PER_TOKEN = 4;

async function main() {
  console.log("\n" + "═".repeat(80));
  console.log("  ContextFS QUICK DEMO");
  console.log("  Summarizing 5 files with Claude Opus API...");
  console.log("═".repeat(80));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("\n❌ ERROR: ANTHROPIC_API_KEY not set");
    console.error("\nUsage: ANTHROPIC_API_KEY=sk-... npx tsx test/demo.ts");
    console.error("\nGet your API key from: https://console.anthropic.com");
    process.exit(1);
  }

  const summarizer = await createLLMSummarizer(apiKey);

  // Use the actual source files
  const projectPath = path.join(__dirname, "..", "src");
  const allFiles = await scanFiles(projectPath);
  const files = allFiles.slice(0, 5); // Just 5 files

  console.log(`\n📁 Testing ${files.length} files from src/\n`);

  let totalRawTokens = 0;
  let totalSummaryTokens = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = path.relative(projectPath, file);
    const content = await fs.readFile(file, "utf-8");
    const parsed = await parseFile(file);

    const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
    const summary = await summarizer.summarize(parsed);
    const summaryTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);

    totalRawTokens += rawTokens;
    totalSummaryTokens += summaryTokens;

    const savings = ((rawTokens - summaryTokens) / rawTokens * 100).toFixed(1);

    console.log("\n" + "─".repeat(80));
    console.log(`📄 ${fileName}`);
    console.log("─".repeat(80));
    console.log(`\nRaw (${rawTokens} tokens):`);
    console.log(content.slice(0, 300) + (content.length > 300 ? "..." : ""));
    console.log(`\n↓ SUMMARIZED TO (${summaryTokens} tokens, ${savings}% savings):`);
    console.log(summary);
  }

  const savings = ((totalRawTokens - totalSummaryTokens) / totalRawTokens * 100);
  const rawCost = (totalRawTokens / 1_000_000) * 5;
  const summaryCost = (totalSummaryTokens / 1_000_000) * 5;

  console.log("\n" + "═".repeat(80));
  console.log("  DEMO RESULTS");
  console.log("═".repeat(80));
  console.log(`
  Files tested:        ${files.length}
  Token savings:       ${savings.toFixed(1)}%
  Cost without:        $${rawCost.toFixed(4)}
  Cost with ContextFS: $${summaryCost.toFixed(4)}
  Savings:             $${(rawCost - summaryCost).toFixed(4)}
  `);

  console.log("  See the full test with 1,995 files:");
  console.log("  ANTHROPIC_API_KEY=sk-... npx tsx test/quality-2000.ts");
  console.log("═".repeat(80) + "\n");
}

main().catch(console.error);
