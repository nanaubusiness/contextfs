# ContextFS

> Less context. Less tokens. Less money.

ContextFS transforms your codebase into a structured, queryable context system. AI reads plain-text summaries instead of raw files — same understanding, a fraction of the token cost. Plus automatic cross-session memory so every new session picks up where the last one left off.

## What It Does

```
You ask about auth code
  → AI queries ContextFS summaries
  → Reads ~130-token summaries instead of ~690-token raw files
  → Uses ~81% fewer tokens

You close a session at ~65% context (auto-compact threshold)
  → PreCompact hook fires automatically
  → Session is summarized: decisions, open questions, next steps
  → Written to ~/.claude/sessions/summaries/<project-slug>/latest.json

You open a new session
  → SessionStart hook fires automatically
  → Previous session summary is injected as context
  → AI continues seamlessly from where you left off
```

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nanaubusiness/contextfs/main/install.sh | sh
```

**Requirements:** Node.js 18+, `fswatch` (macOS) or `inotifywait` (Linux)

After install, ContextFS MCP server is configured for your editor automatically.

## Commands

| Command | What it does |
|---------|--------------|
| `contextfs build` | Summarize all code files with Claude Haiku |
| `contextfs build --target <file>` | Update one file's summary |
| `contextfs build --mock` | Use mock summarizer (no API key needed) |
| `contextfs query "<topic>"` | Search summaries for files matching a topic |
| `contextfs demo <file>` | Preview what a summary looks like |
| `contextfs init` | Set up ContextFS rules in a new project |
| `contextfs context-files` | Summarize `context/*.md` files into `.summary` sidecars |
| `contextfs compact` | Compact current session transcript into a structured summary |
| `contextfs compact --session-id <id> --transcript-path <path> --project <path>` | Compact a specific session |
| `contextfs session-resume` | Print previous session summary (for hook integration) |
| `contextfs mcp` | Start MCP server over stdio (for AI tool integration) |
| `contextfs install` | Auto-detect editors and install integrations |

## Quick Start

```bash
# 1. Install
curl -fsSL https://raw.githubusercontent.com/nanaubusiness/contextfs/main/install.sh | sh

# 2. Connect your editor (Claude Code, Cursor, Codex, or VS Code)
contextfs install

# 3. Summarize your codebase
contextfs build

# 4. Ask AI about your code
contextfs query "authentication"
# → Returns ranked file matches with summaries

# 5. Done — summaries update automatically on every file save
```

## Cross-Session Memory

ContextFS maintains automatic session continuity with Claude Code:

- **At ~65% context:** PreCompact hook fires → `contextfs compact` writes session summary to `~/.claude/sessions/summaries/<project-slug>/latest.json`
- **On next session start:** SessionStart hook fires → `contextfs session-resume` reads the summary and injects it as context

The summary includes:
- What was accomplished
- Decisions made
- Open questions
- Next steps
- Files discussed
- Projects affected

**No manual steps required.** It just works.

## How It Works

### Code Summaries

1. Run `contextfs build` once — Claude Haiku summarizes every file
2. Summaries are written as `.summary` sidecar files
3. On Claude Code: the MCP server intercepts file reads and returns `.summary` content
4. On other editors: use `contextfs query` to search summaries; summaries auto-update on save

### Context Files

`contextfs context-files` summarizes `context/*.md` files (e.g. `me.md`, `work.md`, `team.md`) into `.summary` sidecars. Run after updating any context file.

### Session Compaction

The `PreCompact` hook in Claude Code fires at ~65% context automatically. It runs `contextfs compact` which:
1. Reads the session transcript from the path provided by the PreCompact hook
2. Extracts user/assistant messages
3. Generates a structured summary via Claude Haiku
4. Writes to `~/.claude/sessions/summaries/<project-slug>/latest.json`

The `SessionStart` hook reads this file on the next launch and injects it as context.

## Summary Format

Each `.summary` file is plain text:

```
Purpose: Handles user authentication and session management
Exports: login, logout, verifyToken, refreshSession
Dependencies: bcrypt, jsonwebtoken, ./db/user.repository
Core logic:
  - login
  - logout
  - verifyToken
  - refreshToken
Risk: high
hash: abc123def456
```

## What Gets Summarized

| Type | Extensions | Notes |
|------|------------|-------|
| TypeScript | `.ts`, `.tsx` | Full summarization |
| JavaScript | `.js`, `.jsx` | Full summarization |
| Python | `.py` | Full summarization |
| Markdown | `.md` | Structure + links parsed |

Skipped: JSON, YAML, HTML, CSS (already compact or prose).

## Real Results

Tested on **1,995 production code files** with Claude Haiku.

| Metric | Value |
|--------|-------|
| Token savings | **~81%** |
| Summary quality | High — every summary covers purpose, exports, dependencies, and risk |

```
Raw file (TypeScript):     ~690 tokens
ContextFS summary:          ~130 tokens
Savings:                   ~81% fewer tokens
```

## Claude Code MCP Integration

The MCP server (`contextfs mcp`) intercepts every file read and returns `.summary` content when available. Raw file access requires user approval for files without summaries — this prevents AI from silently reading thousands of tokens when it could have used a 130-token summary.

Tools exposed via MCP:
- `contextfs_read_file` — read with summary preference
- `contextfs_query` — search summaries by topic
- `contextfs_mcp_compact_session` — trigger session compaction
- `contextfs_mcp_get_session_summary` — get previous session summary

## Editor Support

| Editor | Integration | Auto-update |
|--------|-------------|--------------|
| **Claude Code** | MCP server + PreCompact/SessionStart hooks | Yes |
| **Cursor** | MCP server | Yes |
| **Codex** | MCP server | Yes |
| **VS Code** | MCP server | Yes |

## License

MIT
