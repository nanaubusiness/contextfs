#!/usr/bin/env node

/**
 * ContextFS Real LLM Token Test
 *
 * Uses actual Claude API to summarize and measure real token usage.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx test/llm-token-test.ts
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createLLMSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHARS_PER_TOKEN = 4;

async function testWithLLM(projectPath: string, projectName: string): Promise<{
  totalRawChars: number;
  totalRawTokens: number;
  totalSummaryChars: number;
  totalSummaryTokens: number;
  totalLLMInputTokens: number;
  totalLLMOutputTokens: number;
  fileCount: number;
}> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Testing: ${projectName}`);
  console.log("=".repeat(70));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const summarizer = await createLLMSummarizer(apiKey);
  const files = await scanFiles(projectPath);

  let totalRawChars = 0;
  let totalRawTokens = 0;
  let totalSummaryChars = 0;
  let totalSummaryTokens = 0;
  let totalLLMInputTokens = 0;
  let totalLLMOutputTokens = 0;

  console.log(`Processing ${files.length} files with real LLM...\n`);

  for (let i = 0; i < Math.min(files.length, 10); i++) {
    const file = files[i];
    const fileName = path.relative(projectPath, file);
    const content = await fs.readFile(file, "utf-8");
    const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);

    console.log(`[${i+1}/${Math.min(files.length, 10)}] ${fileName}`);
    console.log(`  Raw: ${content.length} chars → ~${rawTokens} tokens`);

    const parsed = await parseFile(file);
    const summary = await summarizer.summarize(parsed);

    const summaryChars = summary.length;
    const summaryTokens = Math.ceil(summaryChars / CHARS_PER_TOKEN);

    // LLM input is prompt + truncated file content
    const llmInput = Math.ceil((parsed.content.slice(0, 8000).length + 200) / CHARS_PER_TOKEN);
    // LLM output is the summary
    const llmOutput = summaryTokens;

    totalRawChars += content.length;
    totalRawTokens += rawTokens;
    totalSummaryChars += summaryChars;
    totalSummaryTokens += summaryTokens; // Use the already-calculated summaryTokens
    totalLLMInputTokens += llmInput;
    totalLLMOutputTokens += llmOutput;

    console.log(`  Summary: ${summaryChars} chars → ~${summaryTokens} tokens`);
    console.log(`  LLM: ~${llmInput} input + ~${llmOutput} output tokens`);
    console.log("");
  }

  // Extrapolate for all files
  const avgRawPerFile = totalRawTokens / Math.min(files.length, 10);
  const avgSummaryPerFile = totalSummaryTokens / Math.min(files.length, 10);
  const avgLLMInputPerFile = totalLLMInputTokens / Math.min(files.length, 10);
  const avgLLMOutputPerFile = totalLLMOutputTokens / Math.min(files.length, 10);

  return {
    totalRawChars,
    totalRawTokens: Math.round(avgRawPerFile * files.length),
    totalSummaryChars: Math.round(avgSummaryPerFile * files.length),
    totalSummaryTokens: Math.round(avgSummaryPerFile * files.length),
    totalLLMInputTokens: Math.round(avgLLMInputPerFile * files.length),
    totalLLMOutputTokens: Math.round(avgLLMOutputPerFile * files.length),
    fileCount: files.length,
  };
}

function printResults(results: ReturnType<typeof testWithLLM>[], projectNames: string[]) {
  let totalRawTokens = 0;
  let totalSummaryTokens = 0;
  let totalLLMInputTokens = 0;
  let totalLLMOutputTokens = 0;
  let totalFileCount = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    totalRawTokens += r.totalRawTokens;
    totalSummaryTokens += r.totalSummaryTokens;
    totalLLMInputTokens += r.totalLLMInputTokens;
    totalLLMOutputTokens += r.totalLLMOutputTokens;
    totalFileCount += r.fileCount;
  }

  // Token savings: raw vs summary (summary is what you read after generation)
  const summarySavingsPercent = ((totalRawTokens - totalSummaryTokens) / totalRawTokens * 100).toFixed(1);

  // LLM generation cost (one-time)
  const llmGenCostInput = (totalLLMInputTokens / 1_000_000) * 15; // Opus 4.7: $15/1M input
  const llmGenCostOutput = (totalLLMOutputTokens / 1_000_000) * 75; // Opus 4.7: $75/1M output
  const llmGenCost = llmGenCostInput + llmGenCostOutput;

  // Reading cost (cached summary)
  const summaryReadCost = (totalSummaryTokens / 1_000_000) * 15; // Opus 4.7: $15/1M input

  // Raw reading cost
  const rawReadCost = (totalRawTokens / 1_000_000) * 15; // Opus 4.7: $15/1M input

  console.log("\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " REAL LLM TEST RESULTS (Opus 4.7) ".padStart(60).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  TOKEN ANALYSIS");
  console.log("║");
  console.log(`║    Files tested:     ${totalFileCount.toLocaleString()}`);
  console.log(`║    Raw tokens:       ~${totalRawTokens.toLocaleString()}`);
  console.log(`║    Summary tokens:   ~${totalSummaryTokens.toLocaleString()}`);
  console.log(`║    Token savings:   ${summarySavingsPercent}%`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  COSTS (Opus 4.7: $15/1M input, $75/1M output)");
  console.log("║");
  console.log(`║    Raw file reads:        $${rawReadCost.toFixed(2)}`);
  console.log(`║    Summary (cached):     $${summaryReadCost.toFixed(2)}`);
  console.log(`║    Summary generation:   $${llmGenCost.toFixed(2)} (one-time)`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  SESSION COSTS");
  console.log("║");
  console.log(`║    Session 1 (with gen):  $${(rawReadCost + llmGenCost).toFixed(2)}`);
  console.log(`║    Session 2+ (cached):   $${summaryReadCost.toFixed(2)}`);
  console.log(`║    Session 10 (cached):   $${(summaryReadCost * 10).toFixed(2)}`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  SAVINGS vs RAW");
  console.log("║");
  const savings10 = rawReadCost * 10 - (llmGenCost + summaryReadCost * 9);
  const savings100 = rawReadCost * 100 - (llmGenCost + summaryReadCost * 99);
  console.log(`║    10 sessions:  $${savings10.toFixed(2)} saved`);
  console.log(`║    100 sessions: $${savings100.toFixed(2)} saved`);
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              ContextFS Real LLM Token Test (Opus 4.7)                     ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nERROR: ANTHROPIC_API_KEY not set");
    console.error("Usage: ANTHROPIC_API_KEY=sk-ant-... npx tsx test/llm-token-test.ts");
    process.exit(1);
  }

  const testDir = path.join(__dirname);

  // Test with 100 real files (sample)
  const smallProject = path.join(testDir, "mock-projectsmall");
  const xlargeProject = path.join(testDir, "mock-projectxlarge");
  const real100 = path.join(testDir, "mock-project100");

  const results = [];
  const names = [];

  try {
    const r1 = await testWithLLM(smallProject, "Small Project (2 files)");
    results.push(r1);
    names.push("Small Project");
  } catch (e) {
    console.error("Small project test failed:", e);
  }

  try {
    const r2 = await testWithLLM(xlargeProject, "XL Project (~1200 lines)");
    results.push(r2);
    names.push("XL Project");
  } catch (e) {
    console.error("XL project test failed:", e);
  }

  try {
    const r3 = await testWithLLM(real100, "100 Real Files (sampled 10)");
    results.push(r3);
    names.push("100 Real Files");
  } catch (e) {
    console.error("100 real files test failed:", e);
  }

  if (results.length > 0) {
    printResults(results, names);
  }
}

main().catch(console.error);
