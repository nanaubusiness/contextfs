#!/usr/bin/env node

/**
 * ContextFS Real LLM Test with 2000 files using MiniMax API
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createLLMSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARS_PER_TOKEN = 4;

function canAnswerFromSummary(summary: string, parsed: any): { sufficient: boolean; reason: string } {
  if (!summary.includes("Purpose:")) return { sufficient: false, reason: "Missing purpose" };
  if (!summary.includes("Exports:") || summary.includes("Exports: none")) {
    return { sufficient: false, reason: "Missing exports" };
  }
  if (!summary.includes("Core logic:") && parsed.exports.length > 0) {
    return { sufficient: false, reason: "Missing core logic" };
  }
  if (!summary.includes("Dependencies:")) {
    return { sufficient: false, reason: "Missing dependencies" };
  }
  if (!summary.includes("Risk:")) {
    return { sufficient: false, reason: "Missing risk level" };
  }
  return { sufficient: true, reason: "All questions answered" };
}

async function testWithLLM(projectPath: string, apiKey: string): Promise<{
  totalRawTokens: number;
  totalSummaryTokens: number;
  fileCount: number;
  summaryEnough: number;
  needsFallback: number;
}> {
  console.log(`\nProcessing files in: ${projectPath}`);

  const summarizer = await createLLMSummarizer(apiKey);
  const files = await scanFiles(projectPath);

  let totalRawTokens = 0;
  let totalSummaryTokens = 0;
  let summaryEnough = 0;
  let needsFallback = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = await fs.readFile(file, "utf-8");
    const parsed = await parseFile(file);

    const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);

    const summary = await summarizer.summarize(parsed);
    const summaryTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);

    totalRawTokens += rawTokens;
    totalSummaryTokens += summaryTokens;

    const { sufficient } = canAnswerFromSummary(summary, parsed);
    if (sufficient) summaryEnough++;
    else needsFallback++;

    if ((i + 1) % 50 === 0) {
      console.log(`  Processed ${i + 1}/${files.length} files...`);
    }
  }

  return { totalRawTokens, totalSummaryTokens, fileCount: files.length, summaryEnough, needsFallback };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              ContextFS - 2000 REAL FILES WITH MINIMAX LLM                 ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const projectPath = path.join(__dirname, "mock-project2000-real");
  const result = await testWithLLM(projectPath, apiKey);

  const savings = ((result.totalRawTokens - result.totalSummaryTokens) / result.totalRawTokens * 100);
  const rawCost = (result.totalRawTokens / 1_000_000) * 15;
  const summaryCost = (result.totalSummaryTokens / 1_000_000) * 15;

  console.log("\n╔" + "═".repeat(78) + "╗");
  console.log("║" + " REAL LLM TEST RESULTS (MiniMax Haiku → Opus 4.7 pricing)".padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  FILES TESTED: " + result.fileCount.toLocaleString());
  console.log("║");
  console.log("║  TOKEN ANALYSIS");
  console.log("║    Raw tokens:       ~" + result.totalRawTokens.toLocaleString());
  console.log("║    Summary tokens:  ~" + result.totalSummaryTokens.toLocaleString());
  console.log("║    Savings:         " + savings.toFixed(1) + "%");
  console.log("║");
  console.log("║  COST (Opus 4.7: $15/1M input)");
  console.log("║    Raw file reads:  $" + rawCost.toFixed(2));
  console.log("║    Summary reads:   $" + summaryCost.toFixed(2));
  console.log("║    Savings:         $" + (rawCost - summaryCost).toFixed(2) + " (" + savings.toFixed(0) + "%)");
  console.log("║");
  console.log("║  QUESTION ANSWERING");
  console.log("║    Summary enough:   " + result.summaryEnough + " (" + (result.summaryEnough / result.fileCount * 100).toFixed(1) + "%)");
  console.log("║    Needs fallback:  " + result.needsFallback + " (" + (result.needsFallback / result.fileCount * 100).toFixed(1) + "%)");
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");

  return result;
}

main().catch(console.error);
