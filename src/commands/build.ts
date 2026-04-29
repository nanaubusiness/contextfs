import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { scanFiles, parseFile } from "../parser/index.js";
import { createMockSummarizer, createLLMSummarizer, detectProvider, type Summarizer } from "../summarizer/index.js";
import { buildContextMap, loadContextMap, saveContextMap } from "../index-builder.js";
import type { ParsedFile } from "../types.js";

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

  // Parse the already-read content instead of re-reading the file
  let parsed: ParsedFile;
  try {
    parsed = await parseFile(filePath, content);
  } catch (err) {
    console.error(`[contextfs] Failed to parse ${filePath}: ${err}`);
    return { path: filePath, content: "", changed: false };
  }

  if (!parsed.content.trim()) {
    // Empty after parsing (binary file or read error) — skip summarization
    return { path: filePath, content: "", changed: false };
  }

  let summaryContent: string;
  try {
    summaryContent = await summarizer.summarize(parsed);
  } catch (err) {
    console.error(`[contextfs] Failed to summarize ${filePath}: ${err}`);
    return { path: filePath, content: "", changed: false };
  }

  const withHash = `${summaryContent}\nhash: ${currentHash}`;

  try {
    await fs.writeFile(summaryPath, withHash, "utf-8");
  } catch (err) {
    console.error(`[contextfs] Failed to write summary ${summaryPath}: ${err}`);
    return { path: filePath, content: "", changed: false };
  }

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
    // Merge with existing context-map instead of overwriting
    try {
      const existing = await loadContextMap(rootDir);
      const updated: typeof existing.files = { ...existing.files };
      const summaryPath = `${absolutePath}.summary`;
      updated[relativePath] = {
        summary_path: summaryPath,
        purpose: result.content.match(/^Purpose:\s*(.+)/m)?.[1] ?? "",
      };
      await saveContextMap(rootDir, { ...existing, files: updated });
    } catch {
      // No existing context-map — create new one
      try {
        const contextMap = await buildContextMap(rootDir, new Map([[absolutePath, result.content]]));
        await saveContextMap(rootDir, contextMap);
      } catch (err) {
        console.error(`[contextfs] Warning: failed to save context-map: ${err}`);
      }
    }
  }
}

export async function runBuild(args: {
  rootDir: string;
  skipHashCheck: boolean;
  useMockLLM: boolean;
  targetFile?: string;
}): Promise<void> {
  const { rootDir, skipHashCheck, useMockLLM, targetFile } = args;

  let summarizer: Summarizer;
  if (useMockLLM) {
    summarizer = createMockSummarizer();
  } else {
    await detectProvider(); // resolve API key before creating LLM summarizer
    summarizer = await createLLMSummarizer();
  }

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
