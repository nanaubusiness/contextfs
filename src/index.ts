#!/usr/bin/env node

import { runBuild } from "./commands/build.js";
import { runQuery } from "./commands/query.js";

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
  } else if (command === "--help" || command === "-h") {
    printUsage();
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

function printUsage() {
  console.log(`ContextFS - Understand any codebase instantly

Usage:
  contextfs build [options]      Build summaries (or update one file)
  contextfs query "<text>"       Search summaries

Build options:
  --root <dir>        Root directory (default: .)
  --target <file>     Process only this file (for hooks)
  --no-hash           Skip hash check, regenerate all
  --mock              Use mock summarizer (default, no LLM needed)

Query options:
  --root <dir>        Root directory (default: .)
  --limit <n>         Max results (default: 5)

Examples:
  contextfs build                              # Build all
  contextfs build --target src/auth.ts         # Update one file
  contextfs query "auth"
`);
}

async function runBuildCommand(args: string[]) {
  let rootDir = process.cwd();
  let skipHashCheck = false;
  let useMockLLM = true;
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
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });
}

async function runQueryCommand(args: string[]) {
  let rootDir = process.cwd();
  let queryText = "";
  let limit = 5;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && i + 1 < args.length) {
      rootDir = args[++i];
    } else if (arg === "--limit" && i + 1 < args.length) {
      limit = parseInt(args[++i], 10);
    } else if (!arg.startsWith("--")) {
      queryText = arg.replace(/^"(.*)"$/, "$1");
    }
  }

  if (!queryText) {
    console.error("Query text required. Usage: contextfs query \"<text>\"");
    process.exit(1);
  }

  await runQuery({ rootDir, queryText, limit });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
