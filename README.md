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
npm install -g contextfs
```

Install. The hook runs automatically. That's it.

- First run: `contextfs build` fires on every file save → builds all summaries in the background
- After that: only the file you changed gets re-summarized — in milliseconds
- Query by keyword: `contextfs query "auth"` → instant results

```
contextfs query "auth"           → auth middleware, login handler, token verifier
contextfs query "database"     → db client, repository, migrations
contextfs query "api routes"   → router, endpoint handlers
```

## Install

```bash
npm install -g contextfs
```

Then add this to `~/.claude/settings.json` to activate automatic updates:

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

Done. Everything else is automatic.

## Summary Files

Every `.summary` file is plain text:

```
Purpose: Handles user authentication and session management
Exports: login, logout, verifyToken, refreshSession
Dependencies: bcrypt, jsonwebtoken, ./db/user.repository
Core logic:
  - login
  - logout
  - verifyToken
  - refreshSession
Risk: high
hash: abc123def456
```

Human readable. Queryable. No JSON.

## Why It Matters

50 file reads × multiple sessions × token costs = real money.

ContextFS front-loads the work: one install, then query-only. The AI sees only what you ask for, when you ask for it.

## License

MIT
