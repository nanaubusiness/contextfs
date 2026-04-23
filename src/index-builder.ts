import * as fs from "fs/promises";
import * as path from "path";
import { ContextMap, FileSummaryEntry } from "./types.js";

function parsePlainTextSummary(content: string): { purpose: string; exports: string[]; dependencies: string[] } {
  const lines = content.split("\n");
  let purpose = "";
  let exports: string[] = [];
  let dependencies: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Purpose:")) {
      purpose = trimmed.slice(8).trim();
    } else if (trimmed.startsWith("Exports:")) {
      const val = trimmed.slice(8).trim();
      exports = val === "none" ? [] : val.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else if (trimmed.startsWith("Dependencies:")) {
      const val = trimmed.slice(13).trim();
      dependencies = val === "none" ? [] : val.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
  }

  return { purpose, exports, dependencies };
}

export async function buildContextMap(
  rootDir: string,
  summaries: Map<string, string>
): Promise<ContextMap> {
  const files: Record<string, FileSummaryEntry> = {};

  for (const [filePath, summaryContent] of summaries) {
    const relativePath = path.relative(rootDir, filePath);
    const summaryPath = `${filePath}.summary`;
    const { purpose, exports, dependencies } = parsePlainTextSummary(summaryContent);

    files[relativePath] = {
      summary_path: summaryPath,
      purpose,
      exports,
      dependencies,
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
