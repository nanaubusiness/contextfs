#!/usr/bin/env node

/**
 * ContextFS Fallback Test: Does summary answer basic questions?
 *
 * Tests each file by asking basic questions and checking if summary can answer:
 * - What does this file do?
 * - What are the exports?
 * - What does export X do?
 * - What are the dependencies?
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createMockSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface QuestionResult {
  file: string;
  summarySufficient: boolean;
  reason: string;
}

function canAnswerFromSummary(summary: string, parsed: any): { sufficient: boolean; reason: string } {
  // Question 1: What does this file do?
  // Can answer if: summary has Purpose
  if (!summary.includes("Purpose:")) {
    return { sufficient: false, reason: "Missing purpose" };
  }

  // Question 2: What are the exports?
  // Can answer if: summary lists exports
  if (!summary.includes("Exports:") || summary.includes("Exports: none")) {
    return { sufficient: false, reason: "Missing exports" };
  }

  // Question 3: What does each export do?
  // Can answer if: summary has Core logic section
  if (!summary.includes("Core logic:") && parsed.exports.length > 0) {
    return { sufficient: false, reason: "Missing core logic" };
  }

  // Question 4: What are the dependencies?
  // Can answer if: summary has Dependencies
  if (!summary.includes("Dependencies:")) {
    return { sufficient: false, reason: "Missing dependencies" };
  }

  // Question 5: Is this high risk?
  // Can answer if: summary has Risk level
  if (!summary.includes("Risk:")) {
    return { sufficient: false, reason: "Missing risk level" };
  }

  // Additional check: For each export, does summary mention it?
  const summaryLower = summary.toLowerCase();
  const missingExports = parsed.exports.filter((exp: string) =>
    !summaryLower.includes(exp.toLowerCase())
  );

  if (missingExports.length > parsed.exports.length / 2) {
    return { sufficient: false, reason: `Summary missing ${missingExports.length} exports` };
  }

  return { sufficient: true, reason: "All basic questions answered" };
}

async function testFallback(projectPath: string): Promise<{
  total: number;
  summaryEnough: number;
  needsFallback: number;
  results: QuestionResult[];
}> {
  const summarizer = createMockSummarizer();
  const files = await scanFiles(projectPath);

  const results: QuestionResult[] = [];
  let summaryEnough = 0;
  let needsFallback = 0;

  console.log(`Testing ${files.length} files...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = await fs.readFile(file, "utf-8");
    const parsed = await parseFile(file);
    const summary = await summarizer.summarize(parsed);

    const { sufficient, reason } = canAnswerFromSummary(summary, parsed);

    results.push({
      file: path.relative(projectPath, file),
      summarySufficient: sufficient,
      reason,
    });

    if (sufficient) {
      summaryEnough++;
    } else {
      needsFallback++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${files.length}...`);
    }
  }

  return { total: files.length, summaryEnough, needsFallback, results };
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              ContextFS Fallback Test: Summary vs Raw File                 ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const projectPath = path.join(__dirname, "mock-project2000");
  const { total, summaryEnough, needsFallback } = await testFallback(projectPath);

  const enoughPercent = (summaryEnough / total * 100).toFixed(1);
  const fallbackPercent = (needsFallback / total * 100).toFixed(1);

  console.log("\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " FALLBACK TEST RESULTS ".padStart(56).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  BASIC QUESTIONS TESTED:");
  console.log("║    1. What does this file do? (Purpose)");
  console.log("║    2. What are the exports? (Exports)");
  console.log("║    3. What does each export do? (Core logic)");
  console.log("║    4. What are the dependencies? (Dependencies)");
  console.log("║    5. Is this high risk? (Risk level)");
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  RESULTS");
  console.log("║");
  console.log(`║    Summary ENOUGH (no fallback needed): ${summaryEnough.toLocaleString()} (${enoughPercent}%)`);
  console.log(`║    Needs FALLBACK (read raw file):    ${needsFallback.toLocaleString()} (${fallbackPercent}%)`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  WHAT THIS MEANS");
  console.log("║");
  console.log(`║    ${enoughPercent}% of the time, summary answers all basic questions.`);
  console.log(`║    AI would not need to read the raw file.`);
  console.log("║");
  console.log(`║    ${fallbackPercent}% of the time, summary is incomplete.`);
  console.log(`║    AI would need to read the raw file for details.`);
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");

  // Show some examples
  const enoughExamples = results.filter(r => r.summarySufficient).slice(0, 3);
  const fallbackExamples = results.filter(r => !r.summarySufficient).slice(0, 3);

  console.log("\n");
  console.log("EXAMPLES - Summary Enough (no fallback needed):");
  console.log("=".repeat(78));
  for (const ex of enoughExamples) {
    console.log(`  ${ex.file}: ${ex.reason}`);
  }

  console.log("\n");
  console.log("EXAMPLES - Needs Fallback to Raw File:");
  console.log("=".repeat(78));
  if (fallbackExamples.length === 0) {
    console.log("  (none - all summaries were complete)");
  }
  for (const ex of fallbackExamples) {
    console.log(`  ${ex.file}: ${ex.reason}`);
  }

  return { total, summaryEnough, needsFallback };
}

main().catch(console.error);
