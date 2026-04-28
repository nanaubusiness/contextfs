#!/usr/bin/env node

import { runBuild } from "./commands/build.js";
import { runQuery } from "./commands/query.js";
import { runInit } from "./commands/init.js";
import { runDemo } from "./commands/demo.js";
import { runInstall } from "./commands/install.js";
import { runMCP } from "./commands/mcp.js";
import { runCompact } from "./commands/compact.js";
import { runUpdate } from "./commands/update.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];

  if (command === "build") {
    await runBuildCommand(args.slice(1));
  } else if (command === "query") {
    await runQueryCommand(args.slice(1));
  } else if (command === "init") {
    await runInitCommand(args.slice(1));
  } else if (command === "demo") {
    await runDemoCommand(args.slice(1));
  } else if (command === "install") {
    await runInstallCommand(args.slice(1));
  } else if (command === "mcp") {
    await runMCP();
  } else if (command === "compact") {
    await runCompactCommand(args.slice(1));
  } else if (command === "update") {
    await runUpdateCommand(args.slice(1));
  } else if (command === "--help" || command === "-h") {
    printUsage();
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

function printUsage() {
  console.log(`ContextFS

Usage:
  contextfs install                Auto-detect editors and projects, show checklist
  contextfs install --yes          Auto-confirm checklist
  contextfs install --project <dir>  Add a project manually
  contextfs install claude-code   Set up Claude Code only
  contextfs install cursor         Set up Cursor only
  contextfs install codex          Set up Codex only
  contextfs install vscode         Set up VS Code only
  contextfs init                  Re-run setup in current project
  contextfs build                 Build all summaries
  contextfs build --target <file> Update one file
  contextfs demo <file>          Try it on any single file
  contextfs query "<text>"        Search summaries
  contextfs compact               Compact session history into a structured summary
  contextfs update               Update to the latest version from GitHub
  contextfs update --force       Force rebuild even if already up to date
`);
}

async function runBuildCommand(args: string[]) {
  let rootDir = process.cwd();
  let skipHashCheck = false;
  let useMockLLM = false;
  let targetFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && i + 1 < args.length) {
      rootDir = args[++i];
    } else if (arg === "--target" && i + 1 < args.length) {
      targetFile = args[++i];
    } else if (arg === "--no-hash") {
      skipHashCheck = true;
    } else if (arg === "--mock") {
      useMockLLM = true;
    }
  }

  await runBuild({
    rootDir,
    skipHashCheck,
    useMockLLM,
    targetFile,
  });
}

async function runQueryCommand(args: string[]) {
  let rootDir = process.cwd();
  let queryText = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && i + 1 < args.length) {
      rootDir = args[++i];
    } else {
      queryText = arg;
    }
  }

  if (!queryText) {
    console.error("Usage: contextfs query \"<search text>\" [--root <dir>]");
    process.exit(1);
  }

  await runQuery({ rootDir, queryText });
}

async function runInitCommand(args: string[]) {
  let hookOnly = false;
  let claudeMdOnly = false;

  for (const arg of args) {
    if (arg === "--hook-only") hookOnly = true;
    else if (arg === "--claude-md-only") claudeMdOnly = true;
  }

  await runInit({ hookOnly, claudeMdOnly });
}

async function runDemoCommand(args: string[]) {
  if (args.length === 0) {
    console.error("Usage: contextfs demo <file>");
    console.error("\nExample:");
    console.error("  contextfs demo src/index.ts");
    console.error("  ANTHROPIC_API_KEY=sk-... contextfs demo ./src/parser/index.ts");
    process.exit(1);
  }

  await runDemo(args[0]);
}

async function runInstallCommand(args: string[]) {
  let editor: "claude-code" | "cursor" | "codex" | "vscode" | "all" | undefined;
  let autoConfirm = false;
  const projectDirs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "claude-code" || arg === "cursor" || arg === "codex" || arg === "vscode" || arg === "all") {
      editor = arg;
    } else if (arg === "--yes" || arg === "-y") {
      autoConfirm = true;
    } else if (arg === "--project") {
      if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
        console.error("Error: --project requires a directory argument");
        process.exit(1);
      }
      projectDirs.push(args[++i]);
    }
  }

  await runInstall({ editor, projectDirs: projectDirs.length > 0 ? projectDirs : undefined, autoConfirm });
}

async function runCompactCommand(args: string[]) {
  let sessionPath: string | undefined;
  let rootDir = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--session" && i + 1 < args.length) {
      sessionPath = args[++i];
    } else if (arg === "--root" && i + 1 < args.length) {
      rootDir = args[++i];
    }
  }

  await runCompact({ sessionPath, rootDir });
}

async function runUpdateCommand(args: string[]) {
  const force = args.includes("--force") || args.includes("-f");
  await runUpdate({ force });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
