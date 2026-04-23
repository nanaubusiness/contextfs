# ContextFS

> Structured code summaries that make AI coding tools faster and more focused.

[![npm version](https://img.shields.io/npm/v/contextfs)](https://www.npmjs.com/package/contextfs)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## What It Does

ContextFS generates a structured summary for every source file in your project, plus a global context index. When you're working with an AI coding tool, you query the index instead of reading files blindly. The AI gets context instantly, without parsing thousands of lines.

```
Your Codebase (4000 files)
    ↓
ContextFS Build (~10 seconds)
    ↓
4000 .summary files + context-map.json
    ↓
contextfs query "auth" → instant results, no file scanning
```

## Features

- **Structured summaries** — purpose, exports, dependencies, core logic per file
- **Global context index** — `context-map.json` maps your entire codebase
- **Keyword query** — find files by purpose, exports, or logic in milliseconds
- **Hash-based caching** — only re-summarizes changed files on re-runs
- **Works with any AI tool** — Claude, Cursor, Copilot, Codex, any agent
- **Zero config** — `contextfs build` and you're done

## Install

```bash
npm install -g contextfs
```

## Quick Start

```bash
# Build summaries for your project
contextfs build --root ./myproject

# Query by keyword
contextfs query "auth" --root ./myproject
contextfs query "database connection" --root ./myproject
```

## CLI Reference

```
contextfs build [options]      Build summaries for a codebase
contextfs query "<text>"       Query the context map

Build options:
  --root <dir>        Root directory to scan (default: .)
  --no-hash           Skip hash check, regenerate all summaries
  --mock              Use heuristic summarizer (no LLM required)

Query options:
  --root <dir>        Root directory (default: .)
  --limit <n>         Max results to return (default: 5)
```

## Summary Format

Each `file.ts.summary` is strict JSON:

```json
{
  "purpose": "Handles user authentication and session management",
  "exports": ["login", "logout", "verifyToken"],
  "dependencies": ["bcrypt", "jsonwebtoken", "./db/user.repository"],
  "core_logic": [
    "login: validates credentials, returns JWT on success",
    "verifyToken: decodes and validates JWT signature",
    "logout: invalidates token in memory store"
  ],
  "risk_level": "high"
}
```

## Claude Code Integration

Add this to `~/.claude/settings.json` to keep summaries auto-updated:

```json
"hooks": {
  "FileChanged": [{
    "hooks": [{
      "type": "command",
      "command": "contextfs build --root . --mock",
      "async": true,
      "statusMessage": "Updating ContextFS summary"
    }]
  }]
}
```

On first run, ContextFS builds all summaries. After that, it only updates files you edit — in milliseconds.

## Why It Matters

Reading 50 files to understand a codebase costs tokens and time. Querying summaries costs almost nothing and returns exactly what you need. It's not about the AI not understanding your code — it's about getting to the right context faster.

## License

MIT
