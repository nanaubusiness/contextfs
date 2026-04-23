#!/usr/bin/env node

/**
 * ContextFS Test Runner
 *
 * This script tests ContextFS by:
 * 1. Building summaries for mock projects of various sizes
 * 2. Measuring raw file sizes vs summary sizes
 * 3. Estimating token costs for raw file reads vs summary reads
 * 4. Showing the actual token savings
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles } from "../src/parser/index.js";
import { createMockSummarizer } from "../src/summarizer/index.js";
import { parseFile } from "../src/parser/index.js";
import { buildContextMap } from "../src/index-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface FileStats {
  path: string;
  rawChars: number;
  rawLines: number;
  summaryChars: number;
  summaryLines: number;
  estimatedRawTokens: number;
  estimatedSummaryTokens: number;
}

interface ProjectStats {
  name: string;
  totalFiles: number;
  totalRawChars: number;
  totalRawLines: number;
  totalSummaryChars: number;
  totalSummaryLines: number;
  estimatedRawTokens: number;
  estimatedSummaryTokens: number;
  savingsPercent: number;
  files: FileStats[];
}

// Rough token estimation: ~4 chars per token for English code
const CHARS_PER_TOKEN = 4;

async function getFileSize(filePath: string): Promise<{ chars: number; lines: number }> {
  const content = await fs.readFile(filePath, "utf-8");
  return { chars: content.length, lines: content.split("\n").length };
}

async function processFile(filePath: string, summarizer: any): Promise<FileStats> {
  const { chars: rawChars, lines: rawLines } = await getFileSize(filePath);
  const parsed = await parseFile(filePath);
  const summaryContent = await summarizer.summarize(parsed);
  const summaryLines = summaryContent.split("\n").length;

  return {
    path: path.relative(process.cwd(), filePath),
    rawChars,
    rawLines,
    summaryChars: summaryContent.length,
    summaryLines,
    estimatedRawTokens: Math.ceil(rawChars / CHARS_PER_TOKEN),
    estimatedSummaryTokens: Math.ceil(summaryContent.length / CHARS_PER_TOKEN),
  };
}

async function testProject(projectPath: string, projectName: string): Promise<ProjectStats> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${projectName}`);
  console.log(`Path: ${projectPath}`);
  console.log("=".repeat(60));

  const files = await scanFiles(projectPath);
  console.log(`Found ${files.length} files\n`);

  const summarizer = createMockSummarizer();
  const fileStats: FileStats[] = [];

  for (const file of files) {
    const stats = await processFile(file, summarizer);
    fileStats.push(stats);
  }

  const totals = fileStats.reduce(
    (acc, f) => ({
      totalRawChars: acc.totalRawChars + f.rawChars,
      totalRawLines: acc.totalRawLines + f.rawLines,
      totalSummaryChars: acc.totalSummaryChars + f.summaryChars,
      totalSummaryLines: acc.totalSummaryLines + f.summaryLines,
      totalRawTokens: acc.totalRawTokens + f.estimatedRawTokens,
      totalSummaryTokens: acc.totalSummaryTokens + f.estimatedSummaryTokens,
    }),
    { totalRawChars: 0, totalRawLines: 0, totalSummaryChars: 0, totalSummaryLines: 0, totalRawTokens: 0, totalSummaryTokens: 0 }
  );

  const savingsPercent = totals.totalRawTokens > 0
    ? ((totals.totalRawTokens - totals.totalSummaryTokens) / totals.totalRawTokens) * 100
    : 0;

  return {
    name: projectName,
    totalFiles: files.length,
    totalRawChars: totals.totalRawChars,
    totalRawLines: totals.totalRawLines,
    totalSummaryChars: totals.totalSummaryChars,
    totalSummaryLines: totals.totalSummaryLines,
    estimatedRawTokens: totals.totalRawTokens,
    estimatedSummaryTokens: totals.totalSummaryTokens,
    savingsPercent,
    files: fileStats,
  };
}

function printResults(results: ProjectStats[]) {
  console.log("\n\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " RESULTS SUMMARY ".padStart(40).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");

  for (const r of results) {
    const savingsColor = r.savingsPercent > 70 ? "🟢" : r.savingsPercent > 50 ? "🟡" : "🔴";
    console.log(`║`);
    console.log(`║  ${r.name} (${r.totalFiles} files)`);
    console.log(`║    Raw:         ${r.totalRawChars.toLocaleString()} chars | ${r.totalRawLines.toLocaleString()} lines | ~${r.estimatedRawTokens.toLocaleString()} tokens`);
    console.log(`║    Summary:     ${r.totalSummaryChars.toLocaleString()} chars | ${r.totalSummaryLines.toLocaleString()} lines | ~${r.estimatedSummaryTokens.toLocaleString()} tokens`);
    console.log(`║    Savings:     ${savingsColor} ${r.savingsPercent.toFixed(1)}% fewer tokens`);
    console.log(`║`);
  }

  const combinedRaw = results.reduce((a, r) => a + r.estimatedRawTokens, 0);
  const combinedSummary = results.reduce((a, r) => a + r.estimatedSummaryTokens, 0);
  const combinedSavings = combinedRaw > 0 ? ((combinedRaw - combinedSummary) / combinedRaw) * 100 : 0;

  console.log("╠" + "═".repeat(78) + "╣");
  console.log(`║`);
  console.log(`║  COMBINED TOTALS`);
  console.log(`║    Raw all files:      ~${combinedRaw.toLocaleString()} tokens`);
  console.log(`║    Summary all files:  ~${combinedSummary.toLocaleString()} tokens`);
  console.log(`║    Total savings:      ${combinedSavings.toFixed(1)}%`);
  console.log(`║`);
  console.log("╚" + "═".repeat(78) + "╝");
}

function printFileBreakdown(results: ProjectStats[]) {
  console.log("\n\n");
  console.log("FILE-BY-FILE BREAKDOWN");
  console.log("=".repeat(100));

  for (const r of results) {
    console.log(`\n--- ${r.name} ---`);
    console.log("File".padEnd(50) + "Raw Tokens".padEnd(15) + "Summary Tokens".padEnd(15) + "Savings");
    console.log("-".repeat(100));

    for (const f of r.files) {
      const savings = f.estimatedRawTokens > 0
        ? ((f.estimatedRawTokens - f.estimatedSummaryTokens) / f.estimatedRawTokens * 100).toFixed(0) + "%"
        : "N/A";
      console.log(
        f.path.padEnd(50) +
        String(f.estimatedRawTokens).padEnd(15) +
        String(f.estimatedSummaryTokens).padEnd(15) +
        savings
      );
    }
  }
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                         ContextFS Test Suite                                ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const testDir = path.join(__dirname);

  const projects = [
    { path: path.join(testDir, "mock-projectsmall"), name: "Small Project (2 files, ~50 lines)" },
    { path: path.join(testDir, "mock-projectmedium"), name: "Medium Project (1 file, ~300 lines)" },
    { path: path.join(testDir, "mock-projectlarge"), name: "Large Project (1 file, ~500 lines)" },
    { path: path.join(testDir, "mock-projectxlarge"), name: "XL Project (1 file, ~1200 lines)" },
  ];

  const results: ProjectStats[] = [];

  for (const proj of projects) {
    try {
      const stats = await testProject(proj.path, proj.name);
      results.push(stats);
    } catch (err) {
      console.error(`Error testing ${proj.name}: ${err}`);
    }
  }

  printResults(results);
  printFileBreakdown(results);

  // Token cost estimation (based on Claude API pricing)
  console.log("\n\n");
  console.log("💰 COST ESTIMATION (Claude Haiku pricing ~ $0.80 / million input tokens)");
  console.log("=".repeat(80));

  const combinedRaw = results.reduce((a, r) => a + r.estimatedRawTokens, 0);
  const combinedSummary = results.reduce((a, r) => a + r.estimatedSummaryTokens, 0);

  const rawCost = (combinedRaw / 1_000_000) * 0.80;
  const summaryCost = (combinedSummary / 1_000_000) * 0.80;

  console.log(`Reading raw files:        $${rawCost.toFixed(4)}`);
  console.log(`Reading summaries:         $${summaryCost.toFixed(4)}`);
  console.log(`Savings per session:       $${(rawCost - summaryCost).toFixed(4)}`);
  console.log("\nNote: Summaries are generated ONCE, then reused across all sessions.");
  console.log("      For a codebase read 10 times, multiply savings by 10x.");
}

main().catch(console.error);
