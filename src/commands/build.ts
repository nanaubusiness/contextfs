import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { scanFiles, parseFile } from "../parser/index.js";
import { createMockSummarizer, createLLMSummarizer } from "../summarizer/index.js";
import { buildContextMap, saveContextMap } from "../index-builder.js";
import { Summary } from "../types.js";

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function getFileHash(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return computeHash(content);
  } catch {
    return null;
  }
}

async function loadExistingSummary(
  summaryPath: string
): Promise<{ summary: Summary; hash: string } | null> {
  try {
    const content = await fs.readFile(summaryPath, "utf-8");
    const summary = JSON.parse(content) as Summary;
    return { summary, hash: summary.file_hash ?? "" };
  } catch {
    return null;
  }
}

async function processFile(
  filePath: string,
  summarizer: Awaited<ReturnType<typeof createMockSummarizer>>,
  skipHashCheck: boolean,
  useMockLLM: boolean
): Promise<{ path: string; summary: Summary; changed: boolean }> {
  const summaryPath = `${filePath}.summary`;
  const content = await fs.readFile(filePath, "utf-8");
  const currentHash = computeHash(content);

  if (!skipHashCheck) {
    const existing = await loadExistingSummary(summaryPath);
    if (existing && existing.hash === currentHash) {
      return { path: filePath, summary: existing.summary, changed: false };
    }
  }

  const parsed = await parseFile(filePath);
  const summary = await summarizer.summarize(parsed);
  summary.file_hash = currentHash;

  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");

  return { path: filePath, summary, changed: true };
}

export async function runBuild(args: {
  rootDir: string;
  skipHashCheck: boolean;
  useMockLLM: boolean;
  anthropicApiKey?: string;
}): Promise<void> {
  const { rootDir, skipHashCheck, useMockLLM, anthropicApiKey } = args;

  console.error(`[contextfs] Scanning ${rootDir}...`);

  const files = await scanFiles(rootDir);
  console.error(`[contextfs] Found ${files.length} supported files`);

  if (files.length === 0) {
    console.error("[contextfs] No supported files found. Exiting.");
    return;
  }

  const summarizer = useMockLLM
    ? createMockSummarizer()
    : await createLLMSummarizer(anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "");

  const summaries = new Map<string, Summary>();
  let changed = 0;
  let skipped = 0;

  for (const file of files) {
    process.stdout.write(`[contextfs] Processing: ${path.relative(rootDir, file)}\n`);
    const result = await processFile(file, summarizer, skipHashCheck, useMockLLM);
    summaries.set(result.path, result.summary);
    if (result.changed) {
      changed++;
    } else {
      skipped++;
    }
  }

  console.error(`\n[contextfs] Summary: ${changed} generated, ${skipped} unchanged`);

  console.error("[contextfs] Building context-map.json...");
  const contextMap = await buildContextMap(rootDir, summaries);
  await saveContextMap(rootDir, contextMap);
  console.error(`[contextfs] Done. Indexed ${summaries.size} files.`);
}
