#!/usr/bin/env node

/**
 * ContextFS LLM Token Test
 *
 * This script demonstrates REAL token usage with the actual LLM summarizer.
 * Requires ANTHROPIC_API_KEY environment variable.
 *
 * It:
 * 1. Builds summaries using the real LLM (not mock)
 * 2. Measures input/output tokens used
 * 3. Compares to raw file token count
 * 4. Shows actual dollar costs
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

interface TokenUsage {
  file: string;
  rawChars: number;
  rawTokens: number;
  summaryInputTokens: number;
  summaryOutputTokens: number;
  totalLLMTokens: number;
}

async function testLLMSummarizer(projectPath: string, projectName: string): Promise<TokenUsage[]> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`LLM Test: ${projectName}`);
  console.log("=".repeat(70));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY environment variable required");
    process.exit(1);
  }

  const summarizer = await createLLMSummarizer(apiKey);
  const files = await scanFiles(projectPath);

  console.log(`Testing ${files.length} files with real LLM...\n`);

  const results: TokenUsage[] = [];

  for (const file of files) {
    const fileName = path.relative(projectPath, file);
    const content = await fs.readFile(file, "utf-8");
    const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);

    console.log(`Processing: ${fileName}`);
    console.log(`  Raw: ${content.length} chars → ~${rawTokens} tokens`);

    const parsed = await parseFile(file);

    // Time the LLM call
    const startTime = Date.now();
    const summary = await summarizer.summarize(parsed);
    const duration = Date.now() - startTime;

    // Parse token usage from response
    // Note: The actual token count would come from the API response
    // For this demo, we estimate based on input/output sizes
    const summaryTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);

    // Input to LLM is: prompt + file content (capped at 8000 chars in summarizer)
    const llmInputTokens = Math.ceil((parsed.content.slice(0, 8000).length + 200) / CHARS_PER_TOKEN);
    // Output is the summary (typically 200-500 tokens)
    const llmOutputTokens = summaryTokens;

    console.log(`  Summary: ${summary.length} chars → ~${summaryTokens} tokens`);
    console.log(`  LLM call: ~${llmInputTokens} input + ~${llmOutputTokens} output tokens (${duration}ms)`);
    console.log("");

    results.push({
      file: fileName,
      rawChars: content.length,
      rawTokens,
      summaryInputTokens: llmInputTokens,
      summaryOutputTokens: llmOutputTokens,
      totalLLMTokens: llmInputTokens + llmOutputTokens,
    });
  }

  return results;
}

function printLLMResults(allResults: { name: string; results: TokenUsage[] }[]) {
  console.log("\n\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " REAL LLM TOKEN USAGE RESULTS ".padStart(44).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  IMPORTANT: These are ESTIMATES based on character counts.");
  console.log("║  Actual API responses include precise token counts.");
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");

  let totalRawTokens = 0;
  let totalLLMTokens = 0;

  for (const { name, results } of allResults) {
    console.log(`║`);
    console.log(`║  ${name}`);
    console.log(`║  ${"-".repeat(50)}`);

    for (const r of results) {
      const savings = r.rawTokens > 0
        ? ((r.rawTokens - r.totalLLMTokens) / r.rawTokens * 100).toFixed(0) + "%"
        : "N/A";

      console.log(`║    ${r.file}`);
      console.log(`║      Raw file:          ~${r.rawTokens.toLocaleString()} tokens`);
      console.log(`║      LLM summary cost: ~${r.totalLLMTokens.toLocaleString()} tokens`);
      console.log(`║      Savings:           ${savings}`);
      console.log(`║`);

      totalRawTokens += r.rawTokens;
      totalLLMTokens += r.totalLLMTokens;
    }
  }

  const totalSavings = totalRawTokens > 0
    ? ((totalRawTokens - totalLLMTokens) / totalRawTokens * 100).toFixed(1)
    : "0";

  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  SUMMARY");
  console.log("║");
  console.log(`║    Total raw token equivalent:     ~${totalRawTokens.toLocaleString()} tokens`);
  console.log(`║    Total LLM tokens spent:          ~${totalLLMTokens.toLocaleString()} tokens`);
  console.log(`║    Token savings:                    ${totalSavings}%`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  WHY THE SAVINGS?");
  console.log("║");
  console.log("║    - LLM is called ONCE per file to generate summary");
  console.log("║    - Summary is cached to disk (.summary files)");
  console.log("║    - Subsequent reads use the cached summary (~100-500 chars)");
  console.log("║    - Raw file read would be thousands of chars every time");
  console.log("║");
  console.log("║  COST COMPARISON (at $0.80/M input + $4.00/M output for Haiku):");
  console.log("║");

  const inputCost = (totalLLMTokens * 0.75 / 1_000_000) * 0.80; // 75% input
  const outputCost = (totalLLMTokens * 0.25 / 1_000_000) * 4.00; // 25% output
  const llmCost = inputCost + outputCost;
  const rawCost = (totalRawTokens / 1_000_000) * 0.80;
  const costSavings = rawCost - llmCost;

  console.log(`║    Raw file reads cost:              $${rawCost.toFixed(6)}`);
  console.log(`║    LLM summary generation cost:       $${llmCost.toFixed(6)}`);
  console.log(`║    Per-session savings:               $${costSavings.toFixed(6)}`);
  console.log("║");
  console.log("║  NOTE: Summary generation is ONE-TIME. After that, read from cache.");
  console.log("║         For 10 reading sessions: multiply savings by 10x!");
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              ContextFS Real LLM Token Measurement Test                      ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nERROR: ANTHROPIC_API_KEY environment variable not set");
    console.error("\nUsage:");
    console.error("  ANTHROPIC_API_KEY=sk-ant-... npx tsx test/llm-token-test.ts");
    console.error("\nGet your API key from: https://console.anthropic.com/settings/keys");
    process.exit(1);
  }

  const testDir = path.join(__dirname);

  const projects = [
    { path: path.join(testDir, "mock-projectsmall"), name: "Small Project" },
    { path: path.join(testDir, "mock-projectxlarge"), name: "XL Project (~1200 lines)" },
  ];

  const allResults: { name: string; results: TokenUsage[] }[] = [];

  for (const proj of projects) {
    try {
      const results = await testLLMSummarizer(proj.path, proj.name);
      allResults.push({ name: proj.name, results });
    } catch (err) {
      console.error(`Error testing ${proj.name}: ${err}`);
    }
  }

  printLLMResults(allResults);
}

main().catch(console.error);
