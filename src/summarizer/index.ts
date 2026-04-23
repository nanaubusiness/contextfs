import { ParsedFile } from "../types.js";

export interface Summarizer {
  summarize(file: ParsedFile): Promise<string>;
}

export function createMockSummarizer(): Summarizer {
  return {
    async summarize(file: ParsedFile): Promise<string> {
      const content = file.content;

      // Determine risk level heuristically
      let riskLevel = "low";
      const riskIndicators = {
        high: ["eval(", "exec(", "password", "secret", "api_key", "token", "crypto", "auth", "jwt", "session", "payment", "credential", "private"],
        medium: ["fetch(", "http", "request", "async", "await", "Promise", "db", "database", "sql", "cache"],
      };

      const lowerContent = content.toLowerCase();
      for (const indicator of riskIndicators.high) {
        if (lowerContent.includes(indicator)) {
          riskLevel = "high";
          break;
        }
      }
      if (riskLevel === "low") {
        for (const indicator of riskIndicators.medium) {
          if (lowerContent.includes(indicator)) {
            riskLevel = "medium";
            break;
          }
        }
      }

      // Derive purpose from filename and exports
      const filename = file.path.split("/").pop() ?? file.path;
      const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
      const purpose = file.exports.length > 0
        ? `Provides ${file.exports.slice(0, 5).join(", ")}`
        : `Source file: ${nameWithoutExt}`;

      const lines: string[] = [
        `Purpose: ${purpose}`,
        `Exports: ${file.exports.slice(0, 10).join(", ") || "none"}`,
        `Dependencies: ${file.dependencies.slice(0, 10).join(", ") || "none"}`,
      ];

      if (file.exports.length > 0) {
        lines.push("Core logic:");
        for (const exp of file.exports.slice(0, 5)) {
          lines.push(`  - ${exp}`);
        }
      }

      lines.push(`Risk: ${riskLevel}`);

      return lines.join("\n");
    },
  };
}

export async function createLLMSummarizer(apiKey: string): Promise<Summarizer> {
  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  return {
    async summarize(file: ParsedFile): Promise<string> {
      const USER_PROMPT = `Analyze this code file. Respond with exactly this format (no JSON, no extra text):

Purpose: <one sentence>
Exports: <comma-separated list>
Dependencies: <comma-separated list>
Core logic:
  - <key behavior 1>
  - <key behavior 2>
Risk: <low|medium|high>

CODE:
${file.content.slice(0, 8000)}`;

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251101",
        max_tokens: 1024,
        messages: [{ role: "user", content: USER_PROMPT }],
      });

      return response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "";
    },
  };
}
