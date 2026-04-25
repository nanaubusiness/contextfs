#!/usr/bin/env node

/**
 * ContextFS Real LLM Test - Shows original files + summaries for all files
 *
 * For each file:
 * 1. Shows the ORIGINAL source code
 * 2. Shows the GENERATED summary
 * 3. Shows token comparison
 *
 * Features:
 * - Retry logic with exponential backoff for API errors
 * - Graceful handling of connection issues
 * - Progress tracking
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { createLLMSummarizer } from "../src/summarizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARS_PER_TOKEN = 4;

// Retry configuration
const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function summarizeWithRetry(summarizer: any, parsed: any, fileName: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await summarizer.summarize(parsed);
    } catch (error: any) {
      lastError = error;

      // Check if it's a connection error
      const isConnectionError =
        error?.cause?.code === 'ECONNRESET' ||
        error?.cause?.code === 'ENOTFOUND' ||
        error?.cause?.code === 'ETIMEDOUT' ||
        error?.message?.includes('Connection error') ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('ENOTFOUND');

      if (!isConnectionError) {
        // Non-connection error, don't retry
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      const jitter = Math.random() * 1000; // Add randomness to avoid thundering herd

      console.log(`\n  ⚠️  Connection error on attempt ${attempt + 1}/${MAX_RETRIES}`);
      console.log(`  Will retry in ${Math.round((delay + jitter) / 1000)}s...`);

      await sleep(delay + jitter);
    }
  }

  throw lastError;
}

async function main() {
  console.log("\n" + "═".repeat(80));
  console.log("  ContextFS - FULL FILE TEST WITH MiniMax LLM");
  console.log("  Shows: Original File → Generated Summary → Token Analysis");
  console.log("  Features: Retry logic with exponential backoff");
  console.log("═".repeat(80));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY not set");
    console.error("Usage: ANTHROPIC_API_KEY=sk-... npx tsx test/quality-2000.ts");
    process.exit(1);
  }

  const summarizer = await createLLMSummarizer(apiKey);
  const projectPath = path.join(__dirname, "mock-project2000-real");
  const files = await scanFiles(projectPath);

  console.log(`\n📁 Found ${files.length} files to test\n`);
  console.log("─".repeat(80));

  let totalRawTokens = 0;
  let totalSummaryTokens = 0;
  let summaryEnough = 0;
  let needsFallback = 0;
  let filesCompleted = 0;
  let filesFailed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = path.relative(projectPath, file);
    const content = await fs.readFile(file, "utf-8");
    const parsed = await parseFile(file);

    const rawTokens = Math.ceil(content.length / CHARS_PER_TOKEN);

    // Generate summary with retry
    let summary: string;
    try {
      summary = await summarizeWithRetry(summarizer, parsed, fileName);
      filesCompleted++;
    } catch (error: any) {
      console.log(`\n❌ Failed to process ${fileName} after ${MAX_RETRIES} attempts:`);
      console.log(`   ${error.message}`);
      filesFailed++;
      continue;
    }

    const summaryTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);

    totalRawTokens += rawTokens;
    totalSummaryTokens += summaryTokens;

    const { sufficient, reason } = canAnswerFromSummary(summary, parsed);
    if (sufficient) summaryEnough++;
    else needsFallback++;

    const fileSavings = ((rawTokens - summaryTokens) / rawTokens * 100).toFixed(1);

    // Print separator
    console.log("\n" + "═".repeat(80));
    console.log(`📄 FILE ${i + 1}/${files.length}: ${fileName}`);
    console.log("═".repeat(80));

    // ORIGINAL FILE
    console.log("\n┌──────────────────────────────────────────────────────────────────────────────┐");
    console.log("│  ORIGINAL SOURCE CODE                                                        │");
    console.log("└──────────────────────────────────────────────────────────────────────────────┘");
    console.log(content);

    // GENERATED SUMMARY
    console.log("\n┌──────────────────────────────────────────────────────────────────────────────┐");
    console.log("│  GENERATED SUMMARY                                                           │");
    console.log("└──────────────────────────────────────────────────────────────────────────────┘");
    console.log(summary);

    // TOKEN ANALYSIS
    console.log("\n┌──────────────────────────────────────────────────────────────────────────────┐");
    console.log("│  TOKEN ANALYSIS                                                              │");
    console.log("└──────────────────────────────────────────────────────────────────────────────┘");
    console.log(`  Raw tokens:       ~${rawTokens.toLocaleString()}`);
    console.log(`  Summary tokens:    ~${summaryTokens.toLocaleString()}`);
    console.log(`  Savings:          ${fileSavings}%`);
    console.log(`  Quality check:    ${sufficient ? "✅ PASS" : "❌ FAIL (" + reason + ")"}`);

    console.log("\n" + "─".repeat(80));

    // Progress update every 10 files
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${files.length} files completed`);
      console.log(`   Success: ${filesCompleted} | Failed: ${filesFailed}`);
    }
  }

  // FINAL SUMMARY
  const savings = totalRawTokens > 0
    ? ((totalRawTokens - totalSummaryTokens) / totalRawTokens * 100)
    : 0;
  const rawCost = (totalRawTokens / 1_000_000) * 5;
  const summaryCost = (totalSummaryTokens / 1_000_000) * 5;

  console.log("\n" + "═".repeat(80));
  console.log("  FINAL RESULTS");
  console.log("═".repeat(80));

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                        REAL LLM TEST RESULTS                               ║
║                     (MiniMax → Opus 4.7 pricing)                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  FILES PROCESSED:                                                            ║
║    Completed: ${filesCompleted.toLocaleString().padEnd(57)}║
║    Failed:    ${filesFailed.toString().padEnd(57)}║
║                                                                              ║
║  TOKEN ANALYSIS                                                               ║
║    Raw tokens:       ~${totalRawTokens.toLocaleString().padEnd(47)}║
║    Summary tokens:  ~${totalSummaryTokens.toLocaleString().padEnd(47)}║
║    Savings:         ${savings.toFixed(1).padEnd(47)}%║
║                                                                              ║
║  COST (Opus 4.7: $5/1M input, $25/1M output)                               ║
║    Raw file reads:      $${rawCost.toFixed(2).padEnd(43)}║
║    Summary reads:       $${summaryCost.toFixed(2).padEnd(43)}║
║    Savings:             $${(rawCost - summaryCost).toFixed(2)} (${savings.toFixed(0)}%)                                    ║
║                                                                              ║
║  QUESTION ANSWERING                                                            ║
║    Summary enough:   ${summaryEnough.toString().padEnd(10)} (${filesCompleted > 0 ? (summaryEnough / filesCompleted * 100).toFixed(1) : 0}%)                                             ║
║    Needs fallback:   ${needsFallback.toString().padEnd(10)} (${filesCompleted > 0 ? (needsFallback / filesCompleted * 100).toFixed(1) : 0}%)                                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);

  if (filesFailed > 0) {
    console.log(`\n⚠️  ${filesFailed} files failed. Run again to retry failed files.`);
  }

  return { totalRawTokens, totalSummaryTokens, fileCount: filesCompleted, summaryEnough, needsFallback };
}

main().catch(console.error);
