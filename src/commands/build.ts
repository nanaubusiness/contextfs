import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { scanFiles, parseFile } from "../parser/index.js";
import { createMockSummarizer, createLLMSummarizer, type Summarizer } from "../summarizer/index.js";
import { buildContextMap, saveContextMap } from "../index-builder.js";

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function extractHash(summaryContent: string): string {
  const match = summaryContent.match(/hash:\s*([a-f0-9]+)/i);
  return match?.[1] ?? "";
}

async function loadExistingSummary(
  summaryPath: string
): Promise<{ content: string; hash: string } | null> {
  try {
    const content = await fs.readFile(summaryPath, "utf-8");
    return { content, hash: extractHash(content) };
  } catch {
    return null;
  }
}

async function processFile(
  filePath: string,
  summarizer: Summarizer,
  skipHashCheck: boolean,
): Promise<{ path: string; content: string; changed: boolean }> {
  const summaryPath = `${filePath}.summary`;
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    console.error(`[contextfs] Failed to read ${filePath}: ${err}`);
    return { path: filePath, content: "", changed: false };
  }
  const currentHash = computeHash(content);

  if (!skipHashCheck) {
    const existing = await loadExistingSummary(summaryPath);
    if (existing && existing.hash === currentHash) {
      return { path: filePath, content: existing.content, changed: false };
    }
  }

  const parsed = await parseFile(filePath);
  const summaryContent = await summarizer.summarize(parsed);
  const withHash = `${summaryContent}\nhash: ${currentHash}`;

  await fs.writeFile(summaryPath, withHash, "utf-8");

  return { path: filePath, content: withHash, changed: true };
}

async function processTargetFile(
  filePath: string,
  rootDir: string,
  summarizer: Summarizer,
): Promise<void> {
  // Resolve paths relative to cwd (not rootDir) so --target works intuitively
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const result = await processFile(absolutePath, summarizer, false);
  if (result.changed) {
    const relativePath = path.relative(rootDir, absolutePath);
    console.error(`[contextfs] Updated: ${relativePath}`);
    const contextMap = await buildContextMap(rootDir, new Map([[absolutePath, result.content]]));
    await saveContextMap(rootDir, contextMap);
  }
}

export async function runBuild(args: {
  rootDir: string;
  skipHashCheck: boolean;
  useMockLLM: boolean;
  targetFile?: string;
}): Promise<void> {
  const { rootDir, skipHashCheck, useMockLLM, targetFile } = args;

  const summarizer = useMockLLM
    ? createMockSummarizer()
    : await createLLMSummarizer();

  if (targetFile) {
    await processTargetFile(targetFile, rootDir, summarizer);
    return;
  }

  console.error(`[contextfs] Scanning ${rootDir}...`);

  const files = await scanFiles(rootDir);
  console.error(`[contextfs] Found ${files.length} supported files`);

  if (files.length === 0) {
    console.error("[contextfs] No supported files found. Exiting.");
    return;
  }

  const summaries = new Map<string, string>();
  let changed = 0;
  let skipped = 0;

  for (const file of files) {
    process.stdout.write(`[contextfs] Processing: ${path.relative(rootDir, file)}\n`);
    const result = await processFile(file, summarizer, skipHashCheck);
    summaries.set(result.path, result.content);
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
