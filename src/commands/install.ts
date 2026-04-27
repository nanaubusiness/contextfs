import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execSync, spawn } from "child_process";
import { runInit } from "./init.js";
import { setupWatcher } from "./watcher.js";

function spawnBuild(projectDir: string): void {
  spawn("contextfs", ["build", "--root", projectDir], {
    detached: true,
    stdio: "ignore",
  });
}

export type Editor = "claude-code" | "cursor" | "codex";

const CLAUDE_MD_RULES = `## ContextFS — Summary Files
Before reading raw source files, query the ContextFS summary system:
1. Check if \`*.summary\` files and \`context-map.json\` exist
2. Use \`contextfs query "<search>" --root <dir>\` to find relevant files
3. Only read raw files when: the summary is insufficient, you need full implementation, or the file has no summary

This applies to every file in every project.
`;

const CURSOR_RULES_CONTENT = `---
description: "Read ContextFS .summary files before source files"
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.py"]
alwaysApply: true
---

Before reading any source file, check if a ContextFS .summary file exists
next to it (e.g. src/index.ts → src/index.ts.summary). If it exists, read
the summary first. Only read the raw file if the summary is missing or
insufficient.
`;

const CURSOR_HOOKS_CONTENT = {
  hooks: {
    afterFileEdit: [
      {
        command: "contextfs build --root \"$(pwd)\" --target \"{path}\"",
      },
    ],
  },
};

// ── Claude Code ─────────────────────────────────────────────────────────────────

async function installClaudeCode(projectDirs: string[]): Promise<void> {
  console.log("Setting up Claude Code integration...");

  for (const projectDir of projectDirs) {
    await runInit({ hookOnly: false, claudeMdOnly: false, projectDir });
    console.log(`  Starting initial build in ${projectDir}...`);
    spawnBuild(projectDir);
  }
}

// ── Cursor ───────────────────────────────────────────────────────────────────────

async function installCursor(projectDirs: string[]): Promise<void> {
  console.log("Setting up Cursor integration...");

  const cursorDir = path.join(os.homedir(), ".cursor");

  // Ensure .cursor/rules/ exists
  const rulesDir = path.join(cursorDir, "rules");
  await fs.mkdir(rulesDir, { recursive: true });

  // Write Cursor rules
  const rulesPath = path.join(rulesDir, "contextfs.md");
  try {
    const existing = await fs.readFile(rulesPath, "utf-8");
    if (existing.includes("ContextFS")) {
      console.log("  Cursor rules already exist");
    } else {
      await fs.writeFile(rulesPath, CURSOR_RULES_CONTENT, "utf-8");
      console.log("  Cursor rules installed");
    }
  } catch {
    await fs.writeFile(rulesPath, CURSOR_RULES_CONTENT, "utf-8");
    console.log("  Cursor rules installed");
  }

  // Write Cursor hooks
  const hooksPath = path.join(cursorDir, "hooks.json");
  try {
    const existing = await fs.readFile(hooksPath, "utf-8");
    const parsed = JSON.parse(existing);
    if (parsed.hooks?.afterFileEdit) {
      console.log("  Cursor hooks already configured");
    } else {
      await fs.writeFile(hooksPath, JSON.stringify(CURSOR_HOOKS_CONTENT, null, 2), "utf-8");
      console.log("  Cursor hooks installed");
    }
  } catch {
    await fs.writeFile(hooksPath, JSON.stringify(CURSOR_HOOKS_CONTENT, null, 2), "utf-8");
    console.log("  Cursor hooks installed");
  }

  // Set up rules in each project
  for (const projectDir of projectDirs) {
    const projectRulesDir = path.join(projectDir, ".cursor", "rules");
    await fs.mkdir(projectRulesDir, { recursive: true });
    const projectRulesPath = path.join(projectRulesDir, "contextfs.md");
    try {
      const existing = await fs.readFile(projectRulesPath, "utf-8");
      if (!existing.includes("ContextFS")) {
        await fs.writeFile(projectRulesPath, CURSOR_RULES_CONTENT, "utf-8");
        console.log(`  Cursor rules set up in ${projectDir}`);
      }
    } catch {
      await fs.writeFile(projectRulesPath, CURSOR_RULES_CONTENT, "utf-8");
      console.log(`  Cursor rules set up in ${projectDir}`);
    }
    console.log(`  Starting initial build in ${projectDir}...`);
    spawnBuild(projectDir);
  }

  // Start background watcher
  await setupWatcher(projectDirs, "cursor");
}

// ── Codex ───────────────────────────────────────────────────────────────────────

async function installCodex(projectDirs: string[]): Promise<void> {
  console.log("Setting up Codex integration...");

  const codexDir = path.join(os.homedir(), ".codex");

  // Ensure .codex/rules/ exists
  const rulesDir = path.join(codexDir, "rules");
  await fs.mkdir(rulesDir, { recursive: true });

  // Write Codex rules
  const rulesPath = path.join(rulesDir, "contextfs.rules");
  const rulesContent = `# ContextFS — Read .summary files before source files
# This rule prompts Codex to check .summary files before reading raw source

def contextfs_check_summary(file_path):
    \"\"\"Check if a .summary file exists for the given file path.\"\"\"
    summary_path = file_path + ".summary"
    try:
        with open(summary_path, "r") as f:
            return f.read()
    except:
        return None

# Apply to all code files
for ext in [".ts", ".tsx", ".js", ".jsx", ".py"]:
    match ext:
        case _:
            pass
`;
  try {
    const existing = await fs.readFile(rulesPath, "utf-8");
    if (!existing.includes("ContextFS")) {
      await fs.writeFile(rulesPath, rulesContent, "utf-8");
      console.log("  Codex rules installed");
    } else {
      console.log("  Codex rules already exist");
    }
  } catch {
    await fs.writeFile(rulesPath, rulesContent, "utf-8");
    console.log("  Codex rules installed");
  }

  // Write Codex hooks
  const hooksPath = path.join(codexDir, "hooks.json");
  const codexHooksContent = {
    hooks: {
      afterFileEdit: [
        {
          command: "contextfs build --root \"$(pwd)\" --target \"{path}\"",
        },
      ],
    },
  };
  try {
    const existing = await fs.readFile(hooksPath, "utf-8");
    const parsed = JSON.parse(existing);
    if (parsed.hooks?.afterFileEdit) {
      console.log("  Codex hooks already configured");
    } else {
      await fs.writeFile(hooksPath, JSON.stringify(codexHooksContent, null, 2), "utf-8");
      console.log("  Codex hooks installed");
    }
  } catch {
    await fs.writeFile(hooksPath, JSON.stringify(codexHooksContent, null, 2), "utf-8");
    console.log("  Codex hooks installed");
  }

  // Set up AGENTS.md in each project (Codex's equivalent of CLAUDE.md)
  for (const projectDir of projectDirs) {
    const agentsMdPath = path.join(projectDir, "AGENTS.md");
    try {
      const existing = await fs.readFile(agentsMdPath, "utf-8");
      if (!existing.includes("## ContextFS")) {
        await fs.writeFile(agentsMdPath, existing.trim() + "\n\n" + CLAUDE_MD_RULES + "\n", "utf-8");
        console.log(`  AGENTS.md set up in ${projectDir}`);
      } else {
        console.log(`  AGENTS.md already has ContextFS rules in ${projectDir}`);
      }
    } catch {
      await fs.writeFile(agentsMdPath, CLAUDE_MD_RULES + "\n", "utf-8");
      console.log(`  AGENTS.md created in ${projectDir}`);
    }
    console.log(`  Starting initial build in ${projectDir}...`);
    spawnBuild(projectDir);
  }

  // Start background watcher
  await setupWatcher(projectDirs, "codex");
}

// ── Editor detection ─────────────────────────────────────────────────────────────

export async function detectEditors(): Promise<Editor[]> {
  const editors: Editor[] = [];

  try {
    await fs.access(path.join(os.homedir(), ".claude", "settings.json"));
    editors.push("claude-code");
  } catch { /* not installed */ }

  try {
    await fs.access(path.join(os.homedir(), ".cursor"));
    editors.push("cursor");
  } catch { /* not installed */ }

  try {
    await fs.access(path.join(os.homedir(), ".codex"));
    editors.push("codex");
  } catch { /* not installed */ }

  return editors;
}

// ── Project detection ───────────────────────────────────────────────────────────

export async function detectProjects(editor: Editor): Promise<string[]> {
  const home = os.homedir();
  const installDir = path.join(home, ".local", "contextfs");

  function spotlightQuery(name: string, timeoutMs = 30000): string[] {
    try {
      const output = execSync(
        `mdfind kMDItemFSName == ${name}`,
        { timeout: timeoutMs, stdio: ["ignore", "pipe", "ignore"] }
      ).toString();
      return output.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  let found: string[] = [];

  if (editor === "claude-code") {
    found = spotlightQuery("CLAUDE.md")
      .map(p => p.replace(/\/CLAUDE\.md$/, ""));
  } else if (editor === "cursor") {
    // Find .cursor directories (Cursor project markers)
    found = spotlightQuery(".cursor", 10000)
      .filter(p => !p.includes("Library") && !p.includes("node_modules"))
      .map(p => {
        // .cursor can appear at project root or in subdirs — find the project root
        const idx = p.lastIndexOf("/.cursor");
        return idx > 0 ? p.substring(0, idx) : p;
      });
  } else if (editor === "codex") {
    found = spotlightQuery("AGENTS.md")
      .map(p => p.replace(/\/AGENTS\.md$/, ""));
  }

  return [...new Set(found)].filter(p => {
    // Skip paths that are not writable project dirs
    const lower = p.toLowerCase();
    if (lower.includes("/go/pkg/") || lower.includes("/usr/local/homebrew") || lower.includes("/library/") || lower.includes("node_modules")) {
      return false;
    }
    try {
      if (path.resolve(p) === path.resolve(installDir)) return false;
    } catch { /* ignore */ }
    return true;
  });
}

// ── Main install function ───────────────────────────────────────────────────────

export async function runInstall(args: {
  editor?: Editor | "all";
  projectDirs?: string[];
} = {}): Promise<void> {
  const { editor: requestedEditor, projectDirs: forcedDirs } = args;

  let editors: Editor[];
  if (requestedEditor && requestedEditor !== "all") {
    editors = [requestedEditor];
  } else {
    editors = await detectEditors();
  }

  if (editors.length === 0) {
    console.log("No supported editors detected.");
    console.log("ContextFS supports: Claude Code, Cursor, and Codex.");
    console.log("");
    console.log("To install for a specific editor:");
    console.log("  contextfs install claude-code");
    console.log("  contextfs install cursor");
    console.log("  contextfs install codex");
    return;
  }

  console.log(`Detected editors: ${editors.join(", ")}`);
  console.log("");

  for (const editor of editors) {
    const projects = forcedDirs || await detectProjects(editor);

    if (projects.length === 0) {
      console.log(`No ${editor} projects found.`);
      console.log(`  contextfs install ${editor} --project <dir>`);
      console.log("");
      continue;
    }

    console.log(`[${editor}] Found ${projects.length} project(s):`);
    for (const p of projects) {
      console.log(`  - ${p}`);
    }
    console.log("");

    if (editor === "claude-code") {
      await installClaudeCode(projects);
    } else if (editor === "cursor") {
      await installCursor(projects);
    } else if (editor === "codex") {
      await installCodex(projects);
    }

    console.log("");
  }

  console.log("ContextFS is ready!");
  console.log("");
  console.log("  contextfs build        Build all summaries");
  console.log("  contextfs query \"<text>\" Search summaries");
  console.log("");
  console.log("Summaries will update automatically when you edit files.");
}
