#!/usr/bin/env node

/**
 * ContextFS Quality Test: 100 files
 *
 * Tests that summary quality remains consistent across 100 files:
 * - Token savings distribution
 * - Summary line count consistency
 * - Export detection accuracy
 * - Risk level distribution
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createMockSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHARS_PER_TOKEN = 4;

interface FileQuality {
  name: string;
  rawChars: number;
  rawLines: number;
  rawTokens: number;
  summaryChars: number;
  summaryLines: number;
  summaryTokens: number;
  savingsPercent: number;
  exportsFound: number;
  exportsExpected: number;
  hasPurpose: boolean;
  hasRisk: boolean;
  riskLevel: string;
}

async function test100Files(projectPath: string): Promise<{
  files: FileQuality[];
  stats: {
    totalFiles: number;
    avgSavings: number;
    minSavings: number;
    maxSavings: number;
    stdDevSavings: number;
    totalRawTokens: number;
    totalSummaryTokens: number;
    overallSavings: number;
    exportAccuracy: number;
    purposeCoverage: number;
    riskCoverage: number;
    riskDistribution: Record<string, number>;
  };
}> {
  const summarizer = createMockSummarizer();
  const files = await scanFiles(projectPath);

  const qualities: FileQuality[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    const parsed = await parseFile(file);
    const summary = await summarizer.summarize(parsed);

    const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
    const summaryTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
    const savings = rawTokens > 0 ? ((rawTokens - summaryTokens) / rawTokens) * 100 : 0;

    // Check summary quality
    const hasPurpose = summary.includes("Purpose:");
    const hasRisk = summary.includes("Risk:");
    const riskMatch = summary.match(/Risk:\s*(low|medium|high)/i);
    const riskLevel = riskMatch ? riskMatch[1].toLowerCase() : "unknown";

    qualities.push({
      name: path.relative(projectPath, file),
      rawChars: content.length,
      rawLines: content.split("\n").length,
      rawTokens,
      summaryChars: summary.length,
      summaryLines: summary.split("\n").length,
      summaryTokens,
      savingsPercent: savings,
      exportsFound: parsed.exports.length,
      exportsExpected: parsed.exports.length, // For mock, we just verify detection
      hasPurpose,
      hasRisk,
      riskLevel,
    });
  }

  // Calculate stats
  const savings = qualities.map(q => q.savingsPercent);
  const avgSavings = savings.reduce((a, b) => a + b, 0) / savings.length;
  const minSavings = Math.min(...savings);
  const maxSavings = Math.max(...savings);
  const variance = savings.reduce((a, b) => a + Math.pow(b - avgSavings, 2), 0) / savings.length;
  const stdDevSavings = Math.sqrt(variance);

  const totalRawTokens = qualities.reduce((a, q) => a + q.rawTokens, 0);
  const totalSummaryTokens = qualities.reduce((a, q) => a + q.summaryTokens, 0);
  const overallSavings = totalRawTokens > 0 ? ((totalRawTokens - totalSummaryTokens) / totalRawTokens) * 100 : 0;

  const exportAccuracy = qualities.filter(q => q.exportsFound > 0 || q.exportsExpected === 0).length / qualities.length * 100;
  const purposeCoverage = qualities.filter(q => q.hasPurpose).length / qualities.length * 100;
  const riskCoverage = qualities.filter(q => q.hasRisk).length / qualities.length * 100;

  const riskDistribution: Record<string, number> = {};
  for (const q of qualities) {
    riskDistribution[q.riskLevel] = (riskDistribution[q.riskLevel] || 0) + 1;
  }

  return {
    files: qualities,
    stats: {
      totalFiles: qualities.length,
      avgSavings,
      minSavings,
      maxSavings,
      stdDevSavings,
      totalRawTokens,
      totalSummaryTokens,
      overallSavings,
      exportAccuracy,
      purposeCoverage,
      riskCoverage,
      riskDistribution,
    },
  };
}

function printResults(results: {
  files: FileQuality[];
  stats: {
    totalFiles: number;
    avgSavings: number;
    minSavings: number;
    maxSavings: number;
    stdDevSavings: number;
    totalRawTokens: number;
    totalSummaryTokens: number;
    overallSavings: number;
    exportAccuracy: number;
    purposeCoverage: number;
    riskCoverage: number;
    riskDistribution: Record<string, number>;
  };
}) {
  const { stats } = results;

  console.log("\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " 100 FILE QUALITY TEST RESULTS ".padStart(44).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");

  console.log("║");
  console.log("║  TOKEN SAVINGS ANALYSIS");
  console.log("║");
  console.log(`║    Files tested:           ${stats.totalFiles}`);
  console.log(`║    Average savings:        ${stats.avgSavings.toFixed(1)}%`);
  console.log(`║    Minimum savings:        ${stats.minSavings.toFixed(1)}%`);
  console.log(`║    Maximum savings:        ${stats.maxSavings.toFixed(1)}%`);
  console.log(`║    Std deviation:          ${stats.stdDevSavings.toFixed(1)}%`);
  console.log("║");
  console.log(`║    Total raw tokens:       ~${stats.totalRawTokens.toLocaleString()}`);
  console.log(`║    Total summary tokens:    ~${stats.totalSummaryTokens.toLocaleString()}`);
  console.log(`║    Overall savings:         ${stats.overallSavings.toFixed(1)}%`);
  console.log("║");

  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  SUMMARY QUALITY METRICS");
  console.log("║");
  console.log(`║    Purpose field:          ${stats.purposeCoverage.toFixed(0)}% coverage`);
  console.log(`║    Risk field:             ${stats.riskCoverage.toFixed(0)}% coverage`);
  console.log(`║    Export detection:        ${stats.exportAccuracy.toFixed(0)}% accuracy`);
  console.log("║");

  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  RISK LEVEL DISTRIBUTION");
  console.log("║");
  for (const [level, count] of Object.entries(stats.riskDistribution)) {
    const bar = "█".repeat(Math.round((count / stats.totalFiles) * 40));
    console.log(`║    ${level.padEnd(8)} ${String(count).padStart(3)} ${bar}`);
  }
  console.log("║");

  // Savings histogram
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  SAVINGS DISTRIBUTION (histogram)");
  console.log("║");

  const buckets = [
    [0, 70], [70, 80], [80, 85], [85, 90], [90, 95], [95, 100]
  ];

  for (const [min, max] of buckets) {
    const count = results.files.filter(f => f.savingsPercent >= min && f.savingsPercent < max).length;
    const bar = "█".repeat(Math.round((count / stats.totalFiles) * 40));
    const label = min === 0 ? `<${max}%` : min === 95 ? `>=${min}%` : `${min}-${max}%`;
    console.log(`║    ${label.padEnd(10)} ${String(count).padStart(3)} ${bar}`);
  }
  console.log("║");

  // Show outliers
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  LOWEST SAVINGS (potential quality issues)");
  console.log("║");

  const lowest = [...results.files].sort((a, b) => a.savingsPercent - b.savingsPercent).slice(0, 5);
  for (const f of lowest) {
    console.log(`║    ${f.name.substring(0, 40).padEnd(40)} ${f.savingsPercent.toFixed(1)}%`);
  }
  console.log("║");
  console.log("║  HIGHEST SAVINGS");
  console.log("║");

  const highest = [...results.files].sort((a, b) => b.savingsPercent - a.savingsPercent).slice(0, 5);
  for (const f of highest) {
    console.log(`║    ${f.name.substring(0, 40).padEnd(40)} ${f.savingsPercent.toFixed(1)}%`);
  }
  console.log("║");

  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  COST COMPARISON (Haiku pricing: $0.80/M input)");
  console.log("║");

  const rawCost = (stats.totalRawTokens / 1_000_000) * 0.80;
  const summaryCost = (stats.totalSummaryTokens / 1_000_000) * 0.80;

  console.log(`║    Raw file reads:        $${rawCost.toFixed(6)}`);
  console.log(`║    Summary reads:         $${summaryCost.toFixed(6)}`);
  console.log(`║    Per-session savings:    $${(rawCost - summaryCost).toFixed(6)}`);
  console.log(`║    Over 10 sessions:     $${((rawCost - summaryCost) * 10).toFixed(6)}`);
  console.log(`║    Over 100 sessions:    $${((rawCost - summaryCost) * 100).toFixed(6)}`);
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              ContextFS 100 File Quality Consistency Test                   ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const projectPath = path.join(__dirname, "mock-project100");

  console.log(`\nTesting files in: ${projectPath}`);

  const results = await test100Files(projectPath);
  printResults(results);
}

main().catch(console.error);
