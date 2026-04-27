import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { execSync, spawn } from "child_process";
import { runInit } from "./init.js";
import { setupWatcher } from "./watcher.js";

// ── Types ─────────────────────────────────────────────────────────────────────────

export type Editor = "claude-code" | "cursor" | "codex" | "vscode";

interface DetectedProject {
  path: string;
  editors: Editor[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function spawnBuild(projectDir: string): void {
  spawn("contextfs", ["build", "--root", projectDir], {
    detached: true,
    stdio: "ignore",
  });
}

function yesNoPrompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question + " [Y/n] ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== "n");
    });
  });
}

// ── Constants ────────────────────────────────────────────────────────────────────

const CLAUDE_MD_RULES = `## ContextFS — Summary Files

**ALWAYS use the \`contextfs\` MCP tool for file reads.** Never use native file read tools.

Before reading any source file:
1. Use \`contextfs_read_file\` tool — it returns .summary content when available
2. Only request raw file access when no summary exists and you truly need the raw implementation
3. If prompted to approve raw access — only approve if summary is insufficient

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

const VSCODE_TASKS_CONTENT = {
  version: "2.0.0",
  tasks: [
    {
      label: "ContextFS: update summary",
      type: "shell",
      command: "contextfs build --root ${workspaceFolder} --target ${file}",
      problemMatcher: [],
      runOptions: { runOn: "default" },
    },
  ],
};

const VSCODE_SETTINGS_CONTENT = {
  "search.useIgnoreFiles": false,
  "search.useParentIgnoreFiles": false,
};

// ── MCP Server Configuration ────────────────────────────────────────────────────

const MCP_BIN = os.homedir() + "/.local/bin/contextfs";

const MCP_CONFIG = {
  command: MCP_BIN,
  args: ["mcp"],
  env: {
    PATH: os.homedir() + "/.local/bin:/usr/local/bin:/usr/bin:/bin",
  },
};

async function setupMCP(editor: Editor): Promise<void> {
  if (editor === "claude-code") {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    try {
      let settings: Record<string, unknown> = {};
      const existing = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existing);
      if (!settings.mcpServers) (settings as any).mcpServers = {};
      (settings as any).mcpServers.contextfs = MCP_CONFIG;
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      console.log("  Claude Code MCP server configured");
    } catch {
      console.log("  Claude Code settings not found — MCP not configured");
    }
  } else if (editor === "cursor") {
    const mcpPath = path.join(os.homedir(), ".cursor", "mcp.json");
    try {
      const existing = await fs.readFile(mcpPath, "utf-8");
      const parsed = JSON.parse(existing);
      if (!parsed.contextfs) {
        parsed.contextfs = MCP_CONFIG;
        await fs.writeFile(mcpPath, JSON.stringify(parsed, null, 2), "utf-8");
      }
    } catch {
      await fs.writeFile(mcpPath, JSON.stringify({ contextfs: MCP_CONFIG }, null, 2), "utf-8");
    }
    console.log("  Cursor MCP server configured");
  } else if (editor === "codex") {
    // Codex uses TOML config
    const codexDir = path.join(os.homedir(), ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    const configPath = path.join(codexDir, "config.toml");
    const mcpEntry = `
[mcp_servers.contextfs]
command = "${MCP_BIN}"
args = ["mcp"]
`;
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      if (!existing.includes("contextfs")) {
        await fs.writeFile(configPath, existing.trim() + "\n" + mcpEntry, "utf-8");
      }
    } catch {
      await fs.writeFile(configPath, mcpEntry.trim() + "\n", "utf-8");
    }
    console.log("  Codex MCP server configured");
  } else if (editor === "vscode") {
    const mcpPath = path.join(os.homedir(), ".vscode", "mcp.json");
    await fs.mkdir(path.join(os.homedir(), ".vscode"), { recursive: true });
    try {
      const existing = await fs.readFile(mcpPath, "utf-8");
      const parsed = JSON.parse(existing);
      if (!parsed.contextfs) {
        parsed.contextfs = MCP_CONFIG;
        await fs.writeFile(mcpPath, JSON.stringify(parsed, null, 2), "utf-8");
      }
    } catch {
      await fs.writeFile(mcpPath, JSON.stringify({ contextfs: MCP_CONFIG }, null, 2), "utf-8");
    }
    console.log("  VS Code MCP server configured");
  }
}

// ── Per-editor installation ─────────────────────────────────────────────────────

async function installForEditor(
  editor: Editor,
  projects: string[],
): Promise<void> {
  // Set up MCP server for all editors
  await setupMCP(editor);

  if (editor === "claude-code") {
    for (const projectDir of projects) {
      await runInit({ hookOnly: false, claudeMdOnly: false, projectDir });
      console.log(`  Starting initial build in ${projectDir}...`);
      spawnBuild(projectDir);
    }
  } else if (editor === "cursor") {
    const cursorDir = path.join(os.homedir(), ".cursor");
    const rulesDir = path.join(cursorDir, "rules");
    await fs.mkdir(rulesDir, { recursive: true });

    const rulesPath = path.join(rulesDir, "contextfs.md");
    try {
      const existing = await fs.readFile(rulesPath, "utf-8");
      if (!existing.includes("ContextFS")) {
        await fs.writeFile(rulesPath, CURSOR_RULES_CONTENT, "utf-8");
      }
    } catch {
      await fs.writeFile(rulesPath, CURSOR_RULES_CONTENT, "utf-8");
    }

    const hooksPath = path.join(cursorDir, "hooks.json");
    try {
      const existing = await fs.readFile(hooksPath, "utf-8");
      const parsed = JSON.parse(existing);
      if (!parsed.hooks?.afterFileEdit) {
        await fs.writeFile(hooksPath, JSON.stringify(CURSOR_HOOKS_CONTENT, null, 2), "utf-8");
      }
    } catch {
      await fs.writeFile(hooksPath, JSON.stringify(CURSOR_HOOKS_CONTENT, null, 2), "utf-8");
    }

    for (const projectDir of projects) {
      const projectRulesDir = path.join(projectDir, ".cursor", "rules");
      await fs.mkdir(projectRulesDir, { recursive: true });
      const projectRulesPath = path.join(projectRulesDir, "contextfs.md");
      try {
        const existing = await fs.readFile(projectRulesPath, "utf-8");
        if (!existing.includes("ContextFS")) {
          await fs.writeFile(projectRulesPath, CURSOR_RULES_CONTENT, "utf-8");
        }
      } catch {
        await fs.writeFile(projectRulesPath, CURSOR_RULES_CONTENT, "utf-8");
      }
      console.log(`  Starting initial build in ${projectDir}...`);
      spawnBuild(projectDir);
    }

    await setupWatcher(projects, "cursor");

  } else if (editor === "codex") {
    const codexDir = path.join(os.homedir(), ".codex");
    const rulesDir = path.join(codexDir, "rules");
    await fs.mkdir(rulesDir, { recursive: true });

    const rulesContent = `# ContextFS — Read .summary files before source files
# Apply to all code files
`;
    const rulesPath = path.join(rulesDir, "contextfs.rules");
    try {
      const existing = await fs.readFile(rulesPath, "utf-8");
      if (!existing.includes("ContextFS")) {
        await fs.writeFile(rulesPath, rulesContent, "utf-8");
      }
    } catch {
      await fs.writeFile(rulesPath, rulesContent, "utf-8");
    }

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
      if (!parsed.hooks?.afterFileEdit) {
        await fs.writeFile(hooksPath, JSON.stringify(codexHooksContent, null, 2), "utf-8");
      }
    } catch {
      await fs.writeFile(hooksPath, JSON.stringify(codexHooksContent, null, 2), "utf-8");
    }

    for (const projectDir of projects) {
      const agentsMdPath = path.join(projectDir, "AGENTS.md");
      try {
        const existing = await fs.readFile(agentsMdPath, "utf-8");
        if (!existing.includes("## ContextFS")) {
          await fs.writeFile(agentsMdPath, existing.trim() + "\n\n" + CLAUDE_MD_RULES + "\n", "utf-8");
        }
      } catch {
        await fs.writeFile(agentsMdPath, CLAUDE_MD_RULES + "\n", "utf-8");
      }
      console.log(`  Starting initial build in ${projectDir}...`);
      spawnBuild(projectDir);
    }

    await setupWatcher(projects, "codex");

  } else if (editor === "vscode") {
    for (const projectDir of projects) {
      // Write .vscode/tasks.json for auto-update on save
      const vscodeDir = path.join(projectDir, ".vscode");
      await fs.mkdir(vscodeDir, { recursive: true });

      const tasksPath = path.join(vscodeDir, "tasks.json");
      try {
        const existing = await fs.readFile(tasksPath, "utf-8");
        const parsed = JSON.parse(existing);
        if (!parsed.tasks?.some((t: any) => t.label === "ContextFS: update summary")) {
          const tasks = parsed.tasks || [];
          tasks.push(VSCODE_TASKS_CONTENT.tasks[0]);
          await fs.writeFile(tasksPath, JSON.stringify({ ...parsed, tasks }, null, 2), "utf-8");
        }
      } catch {
        await fs.writeFile(tasksPath, JSON.stringify(VSCODE_TASKS_CONTENT, null, 2), "utf-8");
      }

      // Write .vscode/settings.json with ContextFS exclusions
      const settingsPath = path.join(vscodeDir, "settings.json");
      try {
        const existing = await fs.readFile(settingsPath, "utf-8");
        const parsed = JSON.parse(existing);
        const merged = { ...VSCODE_SETTINGS_CONTENT, ...parsed };
        await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2), "utf-8");
      } catch {
        await fs.writeFile(settingsPath, JSON.stringify(VSCODE_SETTINGS_CONTENT, null, 2), "utf-8");
      }

      console.log(`  Starting initial build in ${projectDir}...`);
      spawnBuild(projectDir);
    }

    await setupWatcher(projects, "vscode");
  }
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

  // VS Code: check for `code` command or ~/.vscode/
  try {
    execSync("code --version", { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    editors.push("vscode");
  } catch {
    try {
      await fs.access(path.join(os.homedir(), ".vscode"));
      editors.push("vscode");
    } catch { /* not installed */ }
  }

  return editors;
}

// ── Project detection ───────────────────────────────────────────────────────────

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

function filterProjects(paths: string[]): string[] {
  const home = os.homedir();
  const installDir = path.join(home, ".local", "contextfs");

  return [...new Set(paths)].filter((p) => {
    const lower = p.toLowerCase();
    // Skip system and cache dirs
    if (lower.includes("/go/pkg/") || lower.includes("/usr/local/homebrew") || lower.includes("/library/") || lower.includes("node_modules")) {
      return false;
    }
    try {
      if (path.resolve(p) === path.resolve(installDir)) return false;
    } catch { /* ignore */ }
    return true;
  });
}

async function detectProjectsForEditor(editor: Editor): Promise<string[]> {
  const home = os.homedir();

  let found: string[] = [];

  if (editor === "claude-code") {
    found = spotlightQuery("CLAUDE.md")
      .map((p) => p.replace(/\/CLAUDE\.md$/, ""));
  } else if (editor === "cursor") {
    found = spotlightQuery(".cursor", 10000)
      .filter((p) => !p.includes("Library") && !p.includes("node_modules"))
      .map((p) => {
        const idx = p.lastIndexOf("/.cursor");
        return idx > 0 ? p.substring(0, idx) : p;
      });
  } else if (editor === "codex") {
    found = spotlightQuery("AGENTS.md")
      .map((p) => p.replace(/\/AGENTS\.md$/, ""));
  } else if (editor === "vscode") {
    // .vscode/ directories and .code-workspace files
    const vscodeDirs = spotlightQuery(".vscode", 10000)
      .filter((p) => !p.includes("Library") && !p.includes("node_modules"))
      .map((p) => {
        const idx = p.lastIndexOf("/.vscode");
        return idx > 0 ? p.substring(0, idx) : p;
      });
    const workspaces = spotlightQuery(".code-workspace", 10000)
      .map((p) => path.dirname(p));
    found = [...vscodeDirs, ...workspaces];
  }

  return filterProjects(found);
}

// ── Unified project detection ───────────────────────────────────────────────────

async function detectAllProjects(editors: Editor[]): Promise<DetectedProject[]> {
  const projectMap = new Map<string, Editor[]>();

  for (const editor of editors) {
    const projects = await detectProjectsForEditor(editor);
    for (const proj of projects) {
      if (!projectMap.has(proj)) {
        projectMap.set(proj, []);
      }
      if (!projectMap.get(proj)!.includes(editor)) {
        projectMap.get(proj)!.push(editor);
      }
    }
  }

  return Array.from(projectMap.entries())
    .map(([path, editors]) => ({ path, editors }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ── Checklist display ───────────────────────────────────────────────────────────

function printChecklist(projects: DetectedProject[], editors: Editor[]): void {
  console.log(`\nDetected editors: ${editors.join(", ")}`);
  console.log(`\nProjects found (${projects.length}):`);
  console.log("");

  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const editorTags = proj.editors.map((e) => {
      if (e === "claude-code") return "Claude Code";
      if (e === "cursor") return "Cursor";
      if (e === "codex") return "Codex";
      if (e === "vscode") return "VS Code";
      return e;
    }).join(", ");

    // Shorten home dir
    const shortPath = proj.path.replace(os.homedir(), "~");
    console.log(`  [${i + 1}] ${shortPath}`);
    console.log(`      Editors: ${editorTags}`);
  }
  console.log("");
}

// ── Main install function ───────────────────────────────────────────────────────

export async function runInstall(args: {
  editor?: Editor | "all";
  projectDirs?: string[];
  autoConfirm?: boolean;
} = {}): Promise<void> {
  const { editor: requestedEditor, projectDirs: forcedDirs, autoConfirm = false } = args;

  // Detect editors
  let editors: Editor[];
  if (requestedEditor && requestedEditor !== "all") {
    editors = [requestedEditor];
  } else {
    editors = await detectEditors();
  }

  if (editors.length === 0) {
    console.log("No supported editors detected.");
    console.log("ContextFS supports: Claude Code, Cursor, Codex, and VS Code.");
    console.log("");
    console.log("To install for a specific editor:");
    console.log("  contextfs install claude-code");
    console.log("  contextfs install cursor");
    console.log("  contextfs install codex");
    console.log("  contextfs install vscode");
    return;
  }

  // Detect all projects (merged, deduplicated)
  const allProjects = forcedDirs
    ? forcedDirs.map((p) => ({ path: p, editors }))
    : await detectAllProjects(editors);

  if (allProjects.length === 0) {
    console.log("No projects found.");
    console.log("");
    console.log("To set up a specific project:");
    console.log("  contextfs install --project <dir>");
    return;
  }

  // Show checklist
  printChecklist(allProjects, editors);

  // Ask for confirmation (unless autoConfirm)
  let proceed = autoConfirm;
  if (!proceed) {
    proceed = await yesNoPrompt(`Set up ContextFS in ${allProjects.length} project(s)?`);
  }

  if (!proceed) {
    console.log("Skipped. To set up later:");
    console.log("  contextfs install --project <dir>");
    return;
  }

  // Run setup for each project
  for (const project of allProjects) {
    console.log(`\nSetting up: ${project.path}`);
    for (const editor of project.editors) {
      console.log(`  [${editor}]`);
      await installForEditor(editor, [project.path]);
    }
  }

  console.log("\nContextFS is ready!");
  console.log("");
  console.log("  contextfs build        Build all summaries");
  console.log("  contextfs query \"<text>\" Search summaries");
  console.log("");
  console.log("Summaries will update automatically when you edit files.");
}
