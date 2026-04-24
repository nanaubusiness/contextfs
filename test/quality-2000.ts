#!/usr/bin/env node

/**
 * ContextFS Quality Test with REAL files
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createMockSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function testFiles(projectPath: string) {
  const summarizer = createMockSummarizer();
  const files = await scanFiles(projectPath);
  const CHARS_PER_TOKEN = 4;

  let totalRawTokens = 0;
  let totalSummaryTokens = 0;
  let summaryEnough = 0;
  let needsFallback = 0;

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    const parsed = await parseFile(file);
    const summary = await summarizer.summarize(parsed);

    totalRawTokens += Math.ceil(content.length / CHARS_PER_TOKEN);
    totalSummaryTokens += Math.ceil(summary.length / CHARS_PER_TOKEN);

    const { sufficient } = canAnswerFromSummary(summary, parsed);
    if (sufficient) summaryEnough++;
    else needsFallback++;
  }

  const savings = ((totalRawTokens - totalSummaryTokens) / totalRawTokens * 100);
  const rawCost = (totalRawTokens / 1_000_000) * 15;
  const summaryCost = (totalSummaryTokens / 1_000_000) * 15;

  console.log("\n╔" + "═".repeat(70) + "╗");
  console.log("║" + " REAL FILES TEST RESULTS ".padStart(54).padEnd(70) + "║");
  console.log("╠" + "═".repeat(70) + "╣");
  console.log("║");
  console.log("║  FILES TESTED: " + files.length.toLocaleString());
  console.log("║");
  console.log("║  TOKEN ANALYSIS");
  console.log("║    Raw tokens:       ~" + totalRawTokens.toLocaleString());
  console.log("║    Summary tokens:    ~" + totalSummaryTokens.toLocaleString());
  console.log("║    Savings:          " + savings.toFixed(1) + "%");
  console.log("║");
  console.log("║  COST (Opus 4.7: $15/1M)");
  console.log("║    Raw:              $" + rawCost.toFixed(2));
  console.log("║    Summary:          $" + summaryCost.toFixed(2));
  console.log("║    Savings:          $" + (rawCost - summaryCost).toFixed(2) + " (" + savings.toFixed(0) + "%)");
  console.log("║");
  console.log("║  QUESTION ANSWERING");
  console.log("║    Summary enough:    " + summaryEnough + " (" + (summaryEnough/files.length*100).toFixed(1) + "%)");
  console.log("║    Needs fallback:   " + needsFallback + " (" + (needsFallback/files.length*100).toFixed(1) + "%)");
  console.log("║");
  console.log("╚" + "═".repeat(70) + "╝");

  return { files: files.length, totalRawTokens, totalSummaryTokens, savings, rawCost, summaryCost, summaryEnough, needsFallback };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              ContextFS - REAL FILES QUALITY TEST                            ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const projectPath = path.join(__dirname, "mock-project2000-real");
  return await testFiles(projectPath);
}

main().catch(console.error);
