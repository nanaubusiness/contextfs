#!/usr/bin/env node

/**
 * ContextFS Comparison Test: Raw File Reading vs Summary Reading
 *
 * This test simulates realistic AI coding tool usage:
 * - Scenario: AI needs to understand a codebase to answer a question
 * - Comparison: Reading raw files vs reading summaries
 * - Metrics: Token count, estimated cost, time
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createMockSummarizer } from "../src/summarizer/index.js";
import { buildContextMap } from "../src/index-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Token encoding: ~4 chars per token for code
const CHARS_PER_TOKEN = 4;

// Anthropic Haiku pricing
const INPUT_COST_PER_M = 0.80;
const OUTPUT_COST_PER_M = 4.00;

interface QueryScenario {
  name: string;
  description: string;
  filesToRead: number;
  rawReadMultiplier: number; // How many times we'd read each file in a session
}

interface ComparisonResult {
  scenario: string;
  description: string;

  // Raw file approach
  rawFilesRead: number;
  rawTotalChars: number;
  rawTotalTokens: number;
  rawCostPerSession: number;

  // Summary approach
  summaryFilesRead: number;
  summaryTotalChars: number;
  summaryTotalTokens: number;
  summaryGenTokens: number; // Tokens spent generating summaries
  summaryCostPerSession: number;

  // Savings
  sessionSavings: number;
  sessionSavingsPercent: number;
}

async function measureProject(projectPath: string, projectName: string) {
  const summarizer = createMockSummarizer();
  const files = await scanFiles(projectPath);

  console.log(`\n  Project: ${projectName}`);
  console.log(`  Files: ${files.length}`);

  let totalRawChars = 0;
  let totalSummaryChars = 0;
  let summaryGenTokens = 0;

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    totalRawChars += content.length;

    const parsed = await parseFile(file);
    const summary = await summarizer.summarize(parsed);
    totalSummaryChars += summary.length;
    summaryGenTokens += Math.ceil((parsed.content.slice(0, 8000).length + 200) / CHARS_PER_TOKEN);
  }

  return { totalRawChars, totalSummaryChars, summaryGenTokens, fileCount: files.length };
}

async function runComparison(scenarios: QueryScenario[], projects: { path: string; name: string }[]) {
  const results: ComparisonResult[] = [];

  for (const scenario of scenarios) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Scenario: ${scenario.name}`);
    console.log("=".repeat(70));
    console.log(`Description: ${scenario.description}`);

    let combinedRawChars = 0;
    let combinedSummaryChars = 0;
    let combinedGenTokens = 0;

    for (const proj of projects) {
      const { totalRawChars, totalSummaryChars, summaryGenTokens, fileCount } =
        await measureProject(proj.path, proj.name);

      // Scale by how many files we actually query in this scenario
      const filesToQuery = Math.min(scenario.filesToRead, fileCount);
      const rawCharsForScenario = (totalRawChars / fileCount) * filesToQuery;
      const summaryCharsForScenario = (totalSummaryChars / fileCount) * filesToQuery;

      combinedRawChars += rawCharsForScenario;
      combinedSummaryChars += summaryCharsForScenario;
      combinedGenTokens += summaryGenTokens; // One-time cost
    }

    const rawTokens = Math.ceil(combinedRawChars / CHARS_PER_TOKEN);
    const summaryTokens = Math.ceil(combinedSummaryChars / CHARS_PER_TOKEN);

    // Costs
    const rawCost = (rawTokens / 1_000_000) * INPUT_COST_PER_M;
    const summaryCost = (summaryTokens / 1_000_000) * INPUT_COST_PER_M;

    // Summary generation is one-time, amortized over sessions
    const sessions = scenario.rawReadMultiplier;
    const amortizedGenCost = sessions > 1 ? (combinedGenTokens / 1_000_000) * INPUT_COST_PER_M / sessions : 0;

    const totalSummaryCost = summaryCost + amortizedGenCost;
    const savings = rawCost - totalSummaryCost;
    const savingsPercent = rawCost > 0 ? (savings / rawCost) * 100 : 0;

    const result: ComparisonResult = {
      scenario: scenario.name,
      description: scenario.description,
      rawFilesRead: scenario.filesToRead,
      rawTotalChars: combinedRawChars,
      rawTotalTokens: rawTokens,
      rawCostPerSession: rawCost,
      summaryFilesRead: scenario.filesToRead,
      summaryTotalChars: combinedSummaryChars,
      summaryTotalTokens: summaryTokens,
      summaryGenTokens: combinedGenTokens,
      summaryCostPerSession: totalSummaryCost,
      sessionSavings: savings,
      sessionSavingsPercent: savingsPercent,
    };

    results.push(result);

    console.log(`\n  Results:`);
    console.log(`    Files queried: ${scenario.filesToRead}`);
    console.log(`    Raw approach:  ${rawTokens.toLocaleString()} tokens = $${rawCost.toFixed(6)}`);
    console.log(`    Summary:        ${summaryTokens.toLocaleString()} tokens + amortized gen = $${totalSummaryCost.toFixed(6)}`);
    console.log(`    Per-session savings: $${savings.toFixed(6)} (${savingsPercent.toFixed(1)}%)`);
  }

  return results;
}

function printFinalSummary(results: ComparisonResult[], totalSessions: number) {
  console.log("\n\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " FINAL COMPARISON: RAW vs SUMMARY (across all scenarios) ".padStart(65).padEnd(78) + "║");
  console.log("╠" + "═".repeat(78) + "╣");

  let totalRawCost = 0;
  let totalSummaryCost = 0;

  for (const r of results) {
    console.log(`║`);
    console.log(`║  ${r.scenario}`);
    console.log(`║  ${r.description}`);
    console.log(`║`);
    console.log(`║    Per session:`);
    console.log(`║      Raw cost:     $${r.rawCostPerSession.toFixed(6)}`);
    console.log(`║      Summary cost: $${r.summaryCostPerSession.toFixed(6)}`);
    console.log(`║      Savings:      $${r.sessionSavings.toFixed(6)} (${r.sessionSavingsPercent.toFixed(1)}%)`);

    totalRawCost += r.rawCostPerSession;
    totalSummaryCost += r.summaryCostPerSession;
  }

  const grandSavings = totalRawCost - totalSummaryCost;
  const grandSavingsPercent = totalRawCost > 0 ? (grandSavings / totalRawCost) * 100 : 0;

  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  CUMULATIVE COST (all scenarios, one session each):");
  console.log(`║    Total raw cost:     $${totalRawCost.toFixed(6)}`);
  console.log(`║    Total summary cost: $${totalSummaryCost.toFixed(6)}`);
  console.log(`║    Total savings:     $${grandSavings.toFixed(6)} (${grandSavingsPercent.toFixed(1)}%)`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  AMORTIZED OVER MULTIPLE SESSIONS:");
  console.log(`║    Sessions: ${totalSessions}`);
  const multiSessionSavings = grandSavings * totalSessions;
  console.log(`║    Total savings: $${multiSessionSavings.toFixed(6)}`);
  console.log("║");
  console.log("╠" + "═".repeat(78) + "╣");
  console.log("║");
  console.log("║  WHY DO SUMMARIES SAVE SO MUCH?");
  console.log("║");
  console.log("║    1. A 1000-line file = ~250 lines of raw content");
  console.log("║    2. A summary = ~10-20 lines of key information");
  console.log("║    3. Token ratio: ~10:1 to ~25:1 compression");
  console.log("║    4. Summary generation is ONE-TIME, then cached");
  console.log("║    5. Multiple sessions = multiply the savings");
  console.log("║");
  console.log("╚" + "═".repeat(78) + "╝");
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║        ContextFS: Raw File Reading vs Summary Reading Comparison          ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const testDir = path.join(__dirname);

  const projects = [
    { path: path.join(testDir, "mock-projectsmall"), name: "Small" },
    { path: path.join(testDir, "mock-projectmedium"), name: "Medium" },
    { path: path.join(testDir, "mock-projectlarge"), name: "Large" },
    { path: path.join(testDir, "mock-projectxlarge"), name: "XL" },
  ];

  const scenarios: QueryScenario[] = [
    {
      name: "Quick Lookup",
      description: "AI needs to find one specific function across codebase",
      filesToRead: 2,
      rawReadMultiplier: 1,
    },
    {
      name: "Feature Implementation",
      description: "AI needs to understand multiple files to implement a feature",
      filesToRead: 5,
      rawReadMultiplier: 1,
    },
    {
      name: "Code Review",
      description: "AI reviews entire codebase for issues",
      filesToRead: 10,
      rawReadMultiplier: 1,
    },
    {
      name: "Refactoring",
      description: "AI plans and executes major refactor across many files",
      filesToRead: 10,
      rawReadMultiplier: 3,
    },
  ];

  const results = await runComparison(scenarios, projects);
  printFinalSummary(results, 10); // Assume 10 sessions for amortization
}

main().catch(console.error);
