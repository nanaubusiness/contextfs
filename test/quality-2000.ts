#!/usr/bin/env node

/**
 * ContextFS Quality Test: 2000 files with fallback analysis
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createMockSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function test2000Files(projectPath: string) {
  const summarizer = createMockSummarizer();
  const files = await scanFiles(projectPath);
  const CHARS_PER_TOKEN = 4;

  let totalRawTokens = 0;
  let totalSummaryTokens = 0;
  let completeSummary = 0;  // Can use summary only
  let needsFallback = 0;    // Need to read raw file

  console.log(`Analyzing ${files.length} files...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = await fs.readFile(file, "utf-8");
    const parsed = await parseFile(file);
    const summary = await summarizer.summarize(parsed);

    const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
    const summaryTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);

    totalRawTokens += rawTokens;
    totalSummaryTokens += summaryTokens;

    // Check if summary is complete or needs fallback
    const hasLongContent = content.length > 2000;
    const hasManyExports = parsed.exports.length > 5;
    const hasInnerLogic = content.includes("if (") || content.includes("for (") || content.includes("while (");

    const wouldNeedFallback = hasLongContent || (hasManyExports && hasInnerLogic);

    if (wouldNeedFallback) {
      needsFallback++;
    } else {
      completeSummary++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${files.length}...`);
    }
  }

  const overallSavings = ((totalRawTokens - totalSummaryTokens) / totalRawTokens) * 100;
  const fallbackRate = (needsFallback / files.length) * 100;

  // Calculate real fallback cost
  // 50% read summary, 50% read raw
  const summaryOnlyTokens = Math.ceil(totalRawTokens * 0.5);  // tokens if all used summary
  const mixedTokens = Math.ceil(totalRawTokens * 0.5) + Math.ceil(totalSummaryTokens * 0.5);

  const rawCost = (totalRawTokens / 1_000_000) * 15;
  const summaryOnlyCost = (summaryOnlyTokens / 1_000_000) * 15;
  const mixedCost = (mixedTokens / 1_000_000) * 15;

  console.log("\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " 2000 FILE ANALYSIS WITH FALLBACK ".padStart(55).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  TOKEN BREAKDOWN");
  console.log("║");
  console.log(`║    Total raw tokens:       ~${totalRawTokens.toLocaleString()}`);
  console.log(`║    Total summary tokens:    ~${totalSummaryTokens.toLocaleString()}`);
  console.log(`║    Overall savings:        ${overallSavings.toFixed(1)}%`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  SUMMARY COMPLETENESS");
  console.log("║");
  console.log(`║    Summary complete:      ${completeSummary.toLocaleString()} files (${(100 - fallbackRate).toFixed(1)}%)`);
  console.log(`║    Needs fallback:        ${needsFallback.toLocaleString()} files (${fallbackRate.toFixed(1)}%)`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  REAL COST SCENARIOS (Opus 4.7: $15/1M)");
  console.log("║");
  console.log(`║    All 2000 files via summary:  $${summaryOnlyCost.toFixed(2)}`);
  console.log(`║    Mixed (50/50):                $${mixedCost.toFixed(2)}`);
  console.log(`║    All 2000 files raw:           $${rawCost.toFixed(2)}`);
  console.log("║");
  console.log(`║    Savings (summary only):       $${(rawCost - summaryOnlyCost).toFixed(2)} (${overallSavings.toFixed(0)}%)`);
  console.log(`║    Savings (mixed 50/50):        $${(rawCost - mixedCost).toFixed(2)} (${((rawCost - mixedCost) / rawCost * 100).toFixed(0)}%)`);
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");

  return {
    totalRawTokens,
    totalSummaryTokens,
    overallSavings,
    needsFallback,
    completeSummary,
    fallbackRate,
    rawCost,
    summaryOnlyCost,
    mixedCost,
  };
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              ContextFS 2000 File Analysis with Fallback                  ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const projectPath = path.join(__dirname, "mock-project2000");
  await test2000Files(projectPath);
}

main().catch(console.error);
