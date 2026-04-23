# ContextFS

> Less context. Less tokens. Less money.

Every time your AI coding tool reads your codebase, you pay. ContextFS fixes that.

## The Problem

AI coding tools charge by the token. Every file read, every context load, every prompt — it all adds up. Large codebases burn through tokens fast. And when the AI re-reads the same files across sessions, you're paying for the same work twice.

## How ContextFS Fixes It

ContextFS generates plain-text summaries of every file in your project — once. Then instead of reading raw files, your AI coding tool reads summaries. Same context, a fraction of the tokens.

```
Without ContextFS: 50 file reads × multiple sessions = expensive
With ContextFS:     1 summary read × = cheap
```

Summaries are tiny. A 500-line file becomes a 5-line summary. Your context window stays clear for actual work.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nanaubusiness/contextfs/main/install.sh | sh
```

Then add this to `~/.claude/settings.json` for automatic updates:

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

Done. Everything else is automatic.

## What You Get

- **First install:** ContextFS summarizes every file — in the background
- **Every file save:** Only that file's summary updates — in milliseconds
- **Every prompt:** AI reads summaries instead of raw files — uses way less context

## Summary Format

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

| Approach | Tokens per session | Cost |
|---|---|---|
| Raw files | 50,000+ | $0.50+ |
| ContextFS summaries | 500 | $0.005 |

One install. Ongoing savings.

## License

MIT
