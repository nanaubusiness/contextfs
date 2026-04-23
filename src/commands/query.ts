import * as fs from "fs/promises";
import * as path from "path";
import { loadContextMap } from "../index-builder.js";
import { Summary } from "../types.js";

interface ScoredResult {
  relativePath: string;
  summaryPath: string;
  score: number;
  summary: Summary;
}

function scoreFile(
  query: string,
  relativePath: string,
  summary: Summary
): number {
  const queryLower = query.toLowerCase();
  const filename = path.basename(relativePath).toLowerCase();
  let score = 0;

  // +2 if query matches filename
  if (filename.includes(queryLower)) {
    score += 2;
  }

  // +1 per match in purpose
  if (summary.purpose.toLowerCase().includes(queryLower)) {
    score += 1;
  }

  // +1 per match in core_logic
  for (const logic of summary.core_logic) {
    if (logic.toLowerCase().includes(queryLower)) {
      score += 1;
    }
  }

  // +1 per match in exports
  for (const exp of summary.exports) {
    if (exp.toLowerCase().includes(queryLower)) {
      score += 1;
    }
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
  const results: ScoredResult[] = [];

  for (const [relativePath, entry] of Object.entries(contextMap.files)) {
    try {
      const summaryContent = await fs.readFile(entry.summary_path, "utf-8");
      const summary = JSON.parse(summaryContent) as Summary;

      const score = scoreFile(queryText, relativePath, summary);
      if (score > 0) {
        results.push({
          relativePath,
          summaryPath: entry.summary_path,
          score,
          summary,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  const top = results.slice(0, limit);

  if (top.length === 0) {
    console.log("No results found.");
    return;
  }

  for (const result of top) {
    console.log(`\n--- ${result.relativePath} (score: ${result.score}) ---`);
    console.log(`Purpose: ${result.summary.purpose}`);
    if (result.summary.exports.length > 0) {
      console.log(`Exports: ${result.summary.exports.join(", ")}`);
    }
    if (result.summary.core_logic.length > 0) {
      console.log(`Core logic:`);
      for (const logic of result.summary.core_logic) {
        console.log(`  - ${logic}`);
      }
    }
    console.log(`Risk: ${result.summary.risk_level}`);
  }
}
