#!/usr/bin/env node

/**
 * ContextFS Quality Test: 2000 files with fallback analysis
 * Measures: token savings, quality coverage, and when AI needs main file
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
  let needsFallback = 0;
  let completeSummary = 0;

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

    // Analyze if summary is "complete" or needs fallback
    // Summary is complete if: it has purpose, exports, deps, risk, and core logic
    // Needs fallback if: file has complex logic, long functions, or detailed implementation
    const hasPurpose = summary.includes("Purpose:");
    const hasExports = summary.includes("Exports:");
    const hasDeps = summary.includes("Dependencies:");
    const hasRisk = summary.includes("Risk:");
    const hasCoreLogic = summary.includes("Core logic:");
    const hasManyExports = parsed.exports.length > 5;
    const hasLongContent = content.length > 2000;
    const hasInnerLogic = content.includes("if (") || content.includes("for (") || content.includes("while (");

    const summaryComplete = hasPurpose && hasExports && hasDeps && hasRisk && hasCoreLogic;
    const wouldNeedFallback = hasLongContent || (hasManyExports && hasInnerLogic);

    if (summaryComplete && !wouldNeedFallback) {
      completeSummary++;
    } else {
      needsFallback++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${files.length}...`);
    }
  }

  const overallSavings = ((totalRawTokens - totalSummaryTokens) / totalRawTokens) * 100;
  const fallbackRate = (needsFallback / files.length) * 100;

  console.log("\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " 2000 FILE ANALYSIS WITH FALLBACK ".padStart(55).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  TOKEN SAVINGS");
  console.log("║");
  console.log(`║    Total raw tokens:       ~${totalRawTokens.toLocaleString()}`);
  console.log(`║    Total summary tokens:    ~${totalSummaryTokens.toLocaleString()}`);
  console.log(`║    Overall savings:         ${overallSavings.toFixed(1)}%`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  SUMMARY COMPLETENESS");
  console.log("║");
  console.log(`║    Summary is complete:     ${completeSummary.toLocaleString()} (${(100 - fallbackRate).toFixed(1)}%)`);
  console.log(`║    Needs fallback:          ${needsFallback.toLocaleString()} (${fallbackRate.toFixed(1)}%)`);
  console.log("║");
  console.log("║    Note: Fallback means AI would read main file for more details.");
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  COST (Opus 4.7: $15/1M input)");
  console.log("║");
  const rawCost = (totalRawTokens / 1_000_000) * 15;
  const summaryCost = (totalSummaryTokens / 1_000_000) * 15;
  console.log(`║    Raw file reads:           $${rawCost.toFixed(2)}`);
  console.log(`║    Summary reads:            $${summaryCost.toFixed(2)}`);
  console.log(`║    Savings per session:      $${(rawCost - summaryCost).toFixed(2)} (${overallSavings.toFixed(0)}%)`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  WHEN AI NEEDS MAIN FILE");
  console.log("║");
  console.log(`║    ${fallbackRate.toFixed(1)}% of files may need fallback to main file`);
  console.log(`║    This happens when:`);
  console.log(`║    - File is >2000 chars (detailed implementation)`);
  console.log(`║    - Many exports + complex logic`);
  console.log(`║    - AI needs to see function bodies, not just signatures`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  FILE UPDATE BEHAVIOR");
  console.log("║");
  console.log(`║    When source file changes: Summary is auto-updated (hash check)`);
  console.log(`║    - If file hash changed → summary regenerated`);
  console.log(`║    - If hash unchanged → cached summary used`);
  console.log(`║    This means: Only pay for summary generation once per change`);
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
    summaryCost,
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
