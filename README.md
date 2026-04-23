# ContextFS

> One command to understand any codebase. Query it instantly. Pay less for AI usage.

[![npm version](https://img.shields.io/npm/v/contextfs)](https://www.npmjs.com/package/contextfs)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## The Problem

Every AI coding tool reads your files to understand your codebase. That costs tokens — every session, every prompt. The more files it needs, the more it costs.

**You pay when:**
- The AI re-reads the same files across multiple sessions
- You paste context manually to explain your project structure
- Broad context is needed just to locate the right file

## How It Works

```
contextfs build
```

One command. ContextFS scans every source file, generates a structured summary for each one, and builds a queryable index. You run it once per project (or let the hook auto-run it).

Then instead of making the AI read files, you query:

```
contextfs query "auth"           → auth middleware, login handler, token verifier
contextfs query "database"     → db client, repository, migrations
contextfs query "api routes"   → router, endpoint handlers
```

Results are instant. Tokens are minimal.

## Install

```bash
npm install -g contextfs
```

Or run without installing:

```bash
npx contextfs build
npx contextfs query "auth"
```

## One Command, Fully Automatic

```bash
contextfs build
```

That's it. No config. No flags needed.

- Scans all `.ts`, `.js`, `.tsx`, `.jsx`, `.py` files recursively
- Generates `file.summary` next to each source file
- Creates `context-map.json` at the project root
- On re-runs: skips files that haven't changed (SHA-256 hash check)

## Query

```bash
contextfs query "auth"
contextfs query "payment" --limit 10
contextfs query "database connection" --root ./backend
```

Returns the most relevant files with their purpose, exports, and core logic — no reading required.

## Claude Code Hook (Auto-Update)

Add this to `~/.claude/settings.json` and ContextFS runs automatically on every file save:

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

First run: builds everything. After that: only updates the file you changed. In milliseconds.

## Summary Files

Every `.summary` file is structured JSON:

```json
{
  "purpose": "Handles user authentication and session management",
  "exports": ["login", "logout", "verifyToken"],
  "dependencies": ["bcrypt", "jsonwebtoken", "./db/user.repository"],
  "core_logic": [
    "login: validates credentials, returns JWT on success",
    "verifyToken: decodes and validates JWT",
    "logout: invalidates session"
  ],
  "risk_level": "high"
}
```

JSON means the summaries are machine-readable and queryable. You don't read them directly — you use `contextfs query` to get human-readable results.

## Why It Matters

50 file reads × multiple sessions × token costs = real money.

ContextFS front-loads the work: one build, then query-only. The AI sees only what you ask for, when you ask for it.

## License

MIT
