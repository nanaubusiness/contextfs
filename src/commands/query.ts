import * as fs from "fs/promises";
import * as path from "path";
import { loadContextMap } from "../index-builder.js";

function parsePurpose(summaryContent: string): string {
  const match = summaryContent.match(/^Purpose:\s*(.+)/m);
  return match ? match[1].trim() : "";
}

function parseExports(summaryContent: string): string[] {
  const match = summaryContent.match(/^Exports:\s*(.+)/m);
  if (!match) return [];
  const val = match[1].trim();
  return val === "none" ? [] : val.split(",").map((s) => s.trim()).filter(Boolean);
}

function scoreFile(query: string, relativePath: string, summaryContent: string): number {
  const queryLower = query.toLowerCase();
  const filename = path.basename(relativePath).toLowerCase();
  let score = 0;

  if (filename.includes(queryLower)) {
    score += 2;
  }

  const purpose = parsePurpose(summaryContent);
  if (purpose.toLowerCase().includes(queryLower)) {
    score += 1;
  }

  const exports = parseExports(summaryContent);
  for (const exp of exports) {
    if (exp.toLowerCase().includes(queryLower)) {
      score += 1;
    }
  }

  if (summaryContent.toLowerCase().includes(queryLower)) {
    score += 1;
  }

  return score;
}

export async function runQuery(args: {
  rootDir: string;
  queryText: string;
  limit?: number;
}): Promise<void> {
  const { rootDir, queryText, limit = 5 } = args;

  const contextMap = await loadContextMap(rootDir);
  const results: Array<{
    relativePath: string;
    summaryPath: string;
    score: number;
    plainText: string;
  }> = [];

  for (const [relativePath, entry] of Object.entries(contextMap.files)) {
    try {
      const resolved = path.resolve(rootDir, entry.summary_path);
      if (!resolved.startsWith(path.resolve(rootDir) + path.sep)) {
        throw new Error(`Invalid path in context-map.json: ${entry.summary_path}`);
      }
      const summaryContent = await fs.readFile(resolved, "utf-8");
      const score = scoreFile(queryText, relativePath, summaryContent);
      if (score > 0) {
        results.push({
          relativePath,
          summaryPath: entry.summary_path,
          score,
          plainText: summaryContent,
        });
      }
    } catch (err) {
      // Tell user which file failed — helps debug missing/broken summaries
      process.stderr.write(`[contextfs query] Skipping ${relativePath}: ${err}\n`);
    }
  }

  results.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));
  const top = results.slice(0, limit);

  if (top.length === 0) {
    console.log("No results found.");
    return;
  }

  for (const result of top) {
    console.log(`\n=== ${result.relativePath} (score: ${result.score}) ===`);
    const lines = result.plainText.split("\n").filter((l) => !l.trim().startsWith("hash:"));
    console.log(lines.join("\n"));
  }
}
