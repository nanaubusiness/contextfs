#!/usr/bin/env node

import { runBuild } from "./commands/build.js";
import { runQuery } from "./commands/query.js";
import { runInit } from "./commands/init.js";
import { runDemo } from "./commands/demo.js";

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
  contextfs init                   Connect ContextFS to Claude Code
  contextfs build                 Build all summaries (Claude Code subscription auto-detected)
  contextfs build --target <file> Update one file
  contextfs demo <file>           Try it on any single file
  contextfs query "<text>"         Search summaries
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
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
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

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
