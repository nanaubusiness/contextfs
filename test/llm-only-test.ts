#!/usr/bin/env node

/**
 * ContextFS Real LLM Test - 100 files with MiniMax
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

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║           ContextFS - REAL LLM TEST (MiniMax)              ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const projectPath = path.join(__dirname, "..", "src");
  const files = await scanFiles(projectPath);
  const summarizer = await createLLMSummarizer(apiKey);

  let totalRawTokens = 0;
  let totalSummaryTokens = 0;
  let qualityPass = 0;
  let qualityFail = 0;

  console.log(`\nTesting ${files.length} files with real LLM...\n`);

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
    sufficient ? qualityPass++ : qualityFail++;

    if ((i + 1) % 10 === 0) {
      console.log(`  Processed ${i + 1}/${files.length} files...`);
    }
  }

  const savings = ((totalRawTokens - totalSummaryTokens) / totalRawTokens * 100);
  const rawCost = (totalRawTokens / 1_000_000) * 5;
  const summaryCost = (totalSummaryTokens / 1_000_000) * 5;
  const qualityPct = (qualityPass / files.length * 100);

  console.log("\n╔" + "═".repeat(78) + "╗");
  console.log("║" + " REAL LLM TEST RESULTS".padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  FILES TESTED:     " + files.length);
  console.log("║");
  console.log("║  TOKEN ANALYSIS");
  console.log("║    Raw tokens:         ~" + totalRawTokens.toLocaleString());
  console.log("║    Summary tokens:     ~" + totalSummaryTokens.toLocaleString());
  console.log("║    Token savings:     " + savings.toFixed(1) + "%");
  console.log("║");
  console.log("║  COST (Opus 4.7: $5/1M input)");
  console.log("║    Raw file reads:      $" + rawCost.toFixed(4));
  console.log("║    Summary reads:      $" + summaryCost.toFixed(4));
  console.log("║    Savings:           $" + (rawCost - summaryCost).toFixed(4) + " (" + savings.toFixed(1) + "%)");
  console.log("║");
  console.log("║  QUALITY");
  console.log("║    Files summarized:   " + qualityPass + "/" + files.length + " (" + qualityPct.toFixed(1) + "%)");
  console.log("║    Quality score:     " + qualityPct.toFixed(1) + "%");
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  EXTRAPOLATED TO 2,000 FILES");
  const scale = 2000 / files.length;
  console.log("║    Raw tokens:         ~" + Math.round(totalRawTokens * scale).toLocaleString());
  console.log("║    Summary tokens:     ~" + Math.round(totalSummaryTokens * scale).toLocaleString());
  console.log("║    Token savings:     " + savings.toFixed(1) + "%");
  console.log("║    Raw cost:           $" + (rawCost * scale).toFixed(2));
  console.log("║    Summary cost:       $" + (summaryCost * scale).toFixed(2));
  console.log("║    Quality:           " + qualityPct.toFixed(1) + "% of files fully answered");
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");
}

main().catch(console.error);
