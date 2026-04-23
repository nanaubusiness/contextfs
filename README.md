# ContextFS

> Understand any codebase instantly. Pay less for AI usage.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## The Problem

Every AI coding tool reads your files to understand your codebase. That costs tokens — every session, every prompt.

**You pay when:**
- The AI re-reads the same files across multiple sessions
- You paste context manually to explain your project
- You need to find the right file just to get started

## The Solution

Install once. Everything else is automatic.

ContextFS builds a map of your entire codebase. Every time you save a file, it quietly updates that file's summary. Your AI coding tool reads the summaries directly — no scanning, no token cost on reading.

## Install

```bash
npm install -g contextfs
```

Then add this to `~/.claude/settings.json`:

```json
"hooks": {
  "FileChanged": [{
    "hooks": [{
      "type": "command",
      "command": "jq -r '.tool_input.file_path // empty' | { read -r f; [ -n \"$f\" ] && contextfs build --root . --mock --target \"$f\"; } 2>/dev/null || true",
      "async": true,
      "statusMessage": "Updating ContextFS summary"
    }]
  }]
}
```

Done. That's the last time you do anything.

## What Happens

- **First install:** ContextFS builds summaries for every file in the background
- **Every file save:** Only that file's summary updates — in milliseconds
- **Every prompt:** Your AI coding tool reads summaries directly, not raw files

## Summary Files

Plain text. Human readable.

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

## Why It Matters

50 file reads × multiple sessions × token costs = real money.

ContextFS front-loads the work. One install. Summaries stay current automatically.

## License

MIT
