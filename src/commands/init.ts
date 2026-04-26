import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const CLAUDE_MD_RULES = `## ContextFS — Summary Files
Before reading raw source files, query the ContextFS summary system:
1. Check if \`*.summary\` files and \`context-map.json\` exist
2. Use \`contextfs query "<search>" --root <dir>\` to find relevant files
3. Only read raw files when: the summary is insufficient, you need full implementation, or the file has no summary

This applies to every file in every project.
`;

export async function runInit(): Promise<void> {
  const homeDir = os.homedir();
  const settingsPath = path.join(homeDir, ".claude", "settings.json");

  // ─── Hook setup ───────────────────────────────────────────────────────────────
  const hookCommand = `contextfs build --root "$(pwd)" --target "$f"`;

  const hookEntry = {
    FileChanged: [{
      hooks: [{
        type: "command",
        command: hookCommand,
        async: true,
        statusMessage: "Updating ContextFS summary"
      }]
    }]
  };

  try {
    let settings: any = {};
    if (await fs.access(settingsPath).then(() => true).catch(() => false)) {
      const content = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(content);
    }

    if (settings.hooks?.FileChanged) {
      const existing = settings.hooks.FileChanged[0]?.hooks?.[0]?.command || "";
      if (existing.includes("contextfs")) {
        console.log("ContextFS hook already configured in ~/.claude/settings.json");
      } else {
        settings.hooks.FileChanged = hookEntry.FileChanged;
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
        console.log("Added ContextFS hook to ~/.claude/settings.json");
      }
    } else {
      if (!settings.hooks) settings.hooks = {};
      settings.hooks.FileChanged = hookEntry.FileChanged;
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      console.log("Added ContextFS hook to ~/.claude/settings.json");
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.log("Claude Code settings not found at ~/.claude/settings.json");
      console.log("To use ContextFS with Claude Code:");
      console.log("1. Make sure Claude Code is installed");
      console.log("2. Add to ~/.claude/settings.json:");
      console.log(JSON.stringify({ hooks: hookEntry }, null, 2));
    } else {
      throw err;
    }
  }

  // ─── CLAUDE.md setup ─────────────────────────────────────────────────────────
  const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");

  try {
    const existing = await fs.readFile(claudeMdPath, "utf-8");
    if (existing.includes("## ContextFS")) {
      console.log("ContextFS already in CLAUDE.md, skipping");
    } else {
      await fs.writeFile(claudeMdPath, existing.trim() + "\n\n" + CLAUDE_MD_RULES + "\n", "utf-8");
      console.log("Added ContextFS rules to CLAUDE.md");
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      await fs.writeFile(claudeMdPath, CLAUDE_MD_RULES + "\n", "utf-8");
      console.log("Created CLAUDE.md with ContextFS rules");
    } else {
      throw err;
    }
  }

  console.log("");
  console.log("ContextFS is ready!");
  console.log("");
  console.log("Usage:");
  console.log("  /contextfs build        Build all summaries");
  console.log("  /contextfs query \"<text>\" Search summaries");
  console.log("  /contextfs init         Re-run setup in a new project");
  console.log("");
  console.log("Every file save in Claude Code will now update that file's summary automatically.");
  console.log("(You may need to restart Claude Code for changes to take effect.)");
}
