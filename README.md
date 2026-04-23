# ContextFS

> Transform any codebase into a structured, queryable context system for AI coding tools.

[![npm version](https://img.shields.io/npm/v/contextfs)](https://www.npmjs.com/package/contextfs)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## The Problem

Every AI coding tool — Claude, Cursor, Copilot — faces the same problem: **understanding your codebase**. They read files, but they don't *know* your code. You end up repeating context, explaining structure, and manually guiding the AI to the right files.

## The Solution

ContextFS generates **structured summaries** for every source file in your project, and a **global context index** that makes your entire codebase queryable in milliseconds.

```
Your Codebase
    ↓
ContextFS Build
    ↓
file1.ts.summary
file2.ts.summary
file3.ts.summary
    + context-map.json
    ↓
Agent queries summaries instead of raw files
```

## Features

- **Deterministic parsing** — extracts exports, imports, and structure via AST/regex
- **LLM-powered summarization** — generates concise purpose + core logic summaries
- **Hash-based caching** — only re-summarizes changed files (instant on re-runs)
- **Global context index** — `context-map.json` maps every file to its summary
- **Keyword query** — find files by purpose, exports, dependencies, or logic
- **Zero config** — works out of the box, no setup required

## Install

```bash
npm install -g contextfs
```

## Quick Start

### Build summaries

```bash
contextfs build --root ./myproject
```

This scans `./myproject` recursively, generates `*.summary` files next to each source file, and creates `context-map.json`.

### Query your codebase

```bash
contextfs query "auth" --root ./myproject
contextfs query "database connection" --root ./myproject
contextfs query "payment" --root ./myproject
```

Returns the top matching files with their purpose, exports, and core logic.

## How It Works

### 1. Build

```bash
contextfs build --root ./myproject
```

**What happens:**
1. Recursively scans all `.ts`, `.js`, `.tsx`, `.jsx`, `.py` files
2. For each file, extracts: exports, imports, structure
3. Generates a `*.summary` JSON file next to each source file
4. Builds `context-map.json` — a global index of your entire codebase
5. On re-runs, skips files whose content hasn't changed (SHA-256 hash)

### 2. Query

```bash
contextfs query "auth" --root ./myproject
```

**What happens:**
1. Loads `context-map.json`
2. Scores every file by keyword match (filename +2, purpose +1, logic +1)
3. Returns top matches with their summaries

## Summary Format

Each `file.ts.summary` is strict JSON:

```json
{
  "purpose": "Handles user authentication and session management",
  "exports": ["login", "logout", "verifyToken", "refreshSession"],
  "dependencies": ["bcrypt", "jsonwebtoken", "./db/user.repository"],
  "core_logic": [
    "login: validates credentials, returns JWT on success",
    "verifyToken: decodes and validates JWT signature",
    "refreshSession: issues new token if not expired",
    "logout: invalidates token in memory store"
  ],
  "risk_level": "high"
}
```

## Claude Code Integration

ContextFS is designed to be the **default lens** for AI coding agents. Add this to your Claude Code settings:

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

Now every time you save a file, ContextFS automatically keeps the summaries up to date — silently, in the background.

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

## Use Cases

### Codebase Exploration
```
contextfs query "payment processing" --root ./backend
```

### Bug Investigation
```bash
contextfs query "null pointer" --root ./src
```

### Onboarding to a New Project
```bash
contextfs query "core business logic" --root ./src
```

### Finding Dead Code
```bash
contextfs query "unused" --root ./src
```

## Architecture

```
contextfs/
├── src/
│   ├── index.ts          # CLI entry
│   ├── parser/           # Recursive scanner + JS/TS/Python parsers
│   ├── summarizer/       # LLM + heuristic summarization
│   ├── index-builder.js  # Builds context-map.json
│   └── commands/
│       ├── build.ts      # contextfs build
│       └── query.ts      # contextfs query
└── README.md
```

## License

MIT
