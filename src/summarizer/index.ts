import { Summary } from "../types.js";
import { ParsedFile } from "../types.js";

export interface Summarizer {
  summarize(file: ParsedFile): Promise<Summary>;
}

export function createMockSummarizer(): Summarizer {
  return {
    async summarize(file: ParsedFile): Promise<Summary> {
      const content = file.content;
      const lines = content.split("\n").slice(0, 20);
      const preview = lines.join("\n");

      // Determine risk level heuristically
      let riskLevel: "low" | "medium" | "high" = "low";
      const riskIndicators = {
        high: ["eval(", "exec(", "password", "secret", "api_key", "token", "crypto", "auth", "jwt", "session"],
        medium: ["fetch(", "http", "request", "async", "await", "Promise", "db", "database", "sql"],
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
        ? `Module providing ${file.exports.join(", ")}`
        : `Source file ${nameWithoutExt}`;

      // Build core_logic from content analysis
      const coreLogic: string[] = [];
      const exportCount = Math.min(file.exports.length, 5);
      for (let i = 0; i < exportCount; i++) {
        coreLogic.push(`Exports: ${file.exports[i]}`);
      }
      if (file.dependencies.length > 0) {
        coreLogic.push(`Dependencies: ${file.dependencies.slice(0, 3).join(", ")}`);
      }

      return {
        purpose,
        exports: file.exports.slice(0, 20),
        dependencies: file.dependencies.slice(0, 20),
        core_logic: coreLogic.slice(0, 5),
        risk_level: riskLevel,
      };
    },
  };
}

export async function createLLMSummarizer(apiKey: string): Promise<Summarizer> {
  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  return {
    async summarize(file: ParsedFile): Promise<Summary> {
      const SYSTEM_PROMPT = `You are a static code analyzer.
You must produce STRICT JSON only.
No explanations. No extra text.`;

      const USER_PROMPT = `Analyze the following code file.

Extract:
* purpose (1 sentence, precise)
* exports (list of exported functions/classes)
* dependencies (imported modules/files)
* core_logic (max 5 bullet points, key behaviors only)
* risk_level (low, medium, high)

Rules:
* Be concise
* Do NOT guess
* If unsure, leave empty
* Output MUST be valid JSON

---

CODE:

\`\`\`
${file.content.slice(0, 8000)}
\`\`\``;

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251101",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: USER_PROMPT }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";

      // Try to extract JSON from response
      let jsonStr = text.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr) as Summary;

      // Validate and fill defaults
      return {
        purpose: Array.isArray(parsed.purpose) ? parsed.purpose[0] ?? "" : (parsed.purpose ?? ""),
        exports: Array.isArray(parsed.exports) ? parsed.exports : [],
        dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
        core_logic: Array.isArray(parsed.core_logic) ? parsed.core_logic.slice(0, 5) : [],
        risk_level: ["low", "medium", "high"].includes(parsed.risk_level ?? "")
          ? (parsed.risk_level as "low" | "medium" | "high")
          : "low",
      };
    },
  };
}
