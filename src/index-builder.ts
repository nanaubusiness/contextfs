import * as fs from "fs/promises";
import * as path from "path";
import { ContextMap, Summary, FileSummaryEntry } from "./types.js";

export async function buildContextMap(
  rootDir: string,
  summaries: Map<string, Summary>
): Promise<ContextMap> {
  const files: Record<string, FileSummaryEntry> = {};

  for (const [filePath, summary] of summaries) {
    const relativePath = path.relative(rootDir, filePath);
    const summaryPath = `${filePath}.summary`;

    files[relativePath] = {
      summary_path: summaryPath,
      exports: summary.exports,
      dependencies: summary.dependencies,
      purpose: summary.purpose,
    };
  }

  return {
    files,
    generated_at: new Date().toISOString(),
    version: "1.0.0",
  };
}

export async function loadContextMap(rootDir: string): Promise<ContextMap> {
  const mapPath = path.join(rootDir, "context-map.json");
  const content = await fs.readFile(mapPath, "utf-8");
  return JSON.parse(content) as ContextMap;
}

export async function saveContextMap(
  rootDir: string,
  contextMap: ContextMap
): Promise<void> {
  const mapPath = path.join(rootDir, "context-map.json");
  await fs.writeFile(mapPath, JSON.stringify(contextMap, null, 2), "utf-8");
}
