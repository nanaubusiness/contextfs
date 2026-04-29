import * as fs from "fs/promises";
import * as path from "path";
import { ContextMap, FileSummaryEntry } from "./types.js";

function parsePurpose(summaryContent: string): string {
  const match = summaryContent.match(/^Purpose:\s*(.+)/m);
  return match ? match[1].trim() : "";
}

export async function buildContextMap(
  rootDir: string,
  summaries: Map<string, string>
): Promise<ContextMap> {
  const files: Record<string, FileSummaryEntry> = {};

  for (const [filePath, summaryContent] of summaries) {
    const relativePath = path.relative(rootDir, filePath);
    const summaryPath = `${filePath}.summary`;
    const purpose = parsePurpose(summaryContent);

    files[relativePath] = {
      summary_path: summaryPath,
      purpose,
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
  try {
    const parsed = JSON.parse(content) as ContextMap;
    // Prevent prototype pollution: reject objects with dangerous keys
    if (parsed && typeof parsed === "object") {
      const dangerous = ["__proto__", "constructor", "prototype"];
      for (const key of dangerous) {
        if (key in parsed) {
          throw new Error(`Invalid context-map.json: contains dangerous key '${key}'. Run 'contextfs build' to regenerate.`);
        }
      }
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.includes("dangerous key")) throw err;
    throw new Error(`Invalid JSON in context-map.json. Run 'contextfs build' to regenerate.`);
  }
}

export async function saveContextMap(
  rootDir: string,
  contextMap: ContextMap
): Promise<void> {
  const mapPath = path.join(rootDir, "context-map.json");
  await fs.writeFile(mapPath, JSON.stringify(contextMap), "utf-8");
}
