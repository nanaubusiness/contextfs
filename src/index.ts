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
  console.log(`ContextFS - Codebase context system for AI coding tools

Usage:
  contextfs build [options]      Build summaries for a codebase
  contextfs query "<text>"       Query the context map

Build options:
  --root <dir>        Root directory to scan (default: .)
  --no-hash           Skip hash check, regenerate all summaries
  --mock              Use mock summarizer (no LLM calls)

Query options:
  --root <dir>        Root directory (default: .)
  --limit <n>         Max results to return (default: 5)

Examples:
  contextfs build
  contextfs build --root ./myproject --mock
  contextfs query "auth"
  contextfs query "auth" --limit 10
`);
}

async function runBuildCommand(args: string[]) {
  let rootDir = process.cwd();
  let skipHashCheck = false;
  let useMockLLM = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && i + 1 < args.length) {
      rootDir = args[++i];
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
