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

async function setupHook(): Promise<void> {
  const homeDir = os.homedir();
  const settingsPath = path.join(homeDir, ".claude", "settings.json");
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
        console.log("ContextFS hook already configured");
      } else {
        settings.hooks.FileChanged = hookEntry.FileChanged;
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
        console.log("ContextFS hook installed");
      }
    } else {
      if (!settings.hooks) settings.hooks = {};
      settings.hooks.FileChanged = hookEntry.FileChanged;
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      console.log("ContextFS hook installed");
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.log("Claude Code settings not found — hook not installed");
    } else {
      throw err;
    }
  }
}

async function setupClaudeMd(cwd?: string): Promise<void> {
  const targetDir = cwd || process.cwd();
  const claudeMdPath = path.join(targetDir, "CLAUDE.md");

  try {
    const existing = await fs.readFile(claudeMdPath, "utf-8");
    if (existing.includes("## ContextFS")) {
      console.log(`  CLAUDE.md already has ContextFS rules (${targetDir})`);
    } else {
      await fs.writeFile(claudeMdPath, existing.trim() + "\n\n" + CLAUDE_MD_RULES + "\n", "utf-8");
      console.log(`  CLAUDE.md updated with ContextFS rules (${targetDir})`);
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      await fs.writeFile(claudeMdPath, CLAUDE_MD_RULES + "\n", "utf-8");
      console.log(`  CLAUDE.md created with ContextFS rules (${targetDir})`);
    } else {
      throw err;
    }
  }
}

export async function runInit(args: {
  hookOnly?: boolean;
  claudeMdOnly?: boolean;
  editor?: "claude-code" | "cursor" | "codex";
  projectDir?: string;
} = {}): Promise<void> {
  const { hookOnly, claudeMdOnly, editor, projectDir } = args;

  // Both flags = run everything (default behavior)
  const doHook = !claudeMdOnly;
  const doClaudeMd = !hookOnly;

  // Claude Code is the only editor with a native hook system
  if (doHook && editor === "claude-code") {
    await setupHook();
  }

  if (doClaudeMd) {
    await setupClaudeMd(projectDir);
  }

  if ((doHook && editor !== "claude-code") || doClaudeMd) {
    console.log("");
    console.log("ContextFS is ready!");
    console.log("");
    console.log("  contextfs build           Build all summaries");
    console.log("  contextfs query \"<text>\"  Search summaries");
    console.log("  contextfs init            Re-run setup in a new project");
    console.log("");
    if (editor === "claude-code") {
      console.log("Every file save in Claude Code will now update that file's summary automatically.");
    } else {
      console.log("Summaries will update automatically when you edit files.");
    }
  }
}
