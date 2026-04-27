# ContextFS

> Less context. Less tokens. Less money.

ContextFS generates plain-text summaries of your codebase — once. Then any AI reads summaries instead of raw files. Same understanding, a fraction of the token cost.

## How It Works

```
You ask about auth code
  → AI queries ContextFS summaries
  → Reads 5-line summaries instead of 500-line files
  → Uses 80% fewer tokens
```

**Claude Code users:** No API key needed. Your subscription token is used automatically.

## Works With Any Editor

ContextFS summaries are plain text — any AI coding tool can read them. Claude Code gets a native MCP server that intercepts file reads and returns summary content instead of raw code. Other editors get automatic updates on file save.

| Editor | Integration | Auto-update | Summary-first |
|--------|-------------|-------------|---------------|
| **Claude Code** | MCP server | Yes — built in | Yes — enforced |
| **Cursor** | MCP server | Yes | Yes — via rules |
| **Codex** | MCP server | Yes | Yes — via rules |
| **VS Code** | MCP server | Yes | Yes — via MCP |
| **Any editor** | `contextfs query` + `.summary` files | Manual | No |

## Install

One command, works with Claude Code, Cursor, and Codex.

```bash
curl -fsSL https://raw.githubusercontent.com/nanaubusiness/contextfs/main/install.sh | sh
```

The installer auto-detects which editors you have and sets up everything automatically.

**Editor-specific install:**
```bash
contextfs install claude-code   # Claude Code only
contextfs install cursor        # Cursor only
contextfs install codex         # Codex only
contextfs install               # Auto-detect (default)
```

**Requirements:** Node.js 18+, `fswatch` (macOS) or `inotifywait` (Linux)

## Commands

```
contextfs install               Auto-detect editors and install
contextfs build                 Build all summaries
contextfs build --target <file> Update one file
contextfs query "<text>"        Search summaries
contextfs demo <file>           Preview summary for one file
contextfs init                  Re-run setup in current project
contextfs mcp                   Start MCP server (stdio, for AI tools)
contextfs compact               Compact session history to session-summary.json
```

**`contextfs mcp`** — Runs an MCP server over stdio. When connected to Claude Code (or other MCP-compatible editors), it intercepts every file read and returns `.summary` content when available. Files without summaries trigger a user approval prompt. Per-session lock — resets each new session.

**`contextfs compact`** — Reads conversation history, generates a structured session summary (files discussed, decisions made, open questions, next steps). Run manually or integrate with Claude Code's `preCompact` hook.

**Rule:** Before reading any code file, query ContextFS first.

## What You Get

- **After install:** `contextfs build` — Claude Haiku summarizes every file once
- **Every save:** Background watcher auto-updates that file's summary (all editors)
- **Claude Code:** MCP server enforces summary-first reads — no raw files unless approved
- **Every question:** AI reads summaries first, raw files only when needed

## What Gets Summarized

ContextFS targets **source code** only:
- TypeScript, JavaScript, Python, TSX, JSX

It skips:
- Markdown / docs — already readable prose
- JSON / YAML — summaries are as long as the files
- HTML / CSS — not optimized

## Summary Format

Each `.summary` file is plain text:

```
Purpose: Auth service login endpoint handling JWT issuance
Exports: login, logout, refreshToken, validateSession
Dependencies: bcrypt, jsonwebtoken, ./db/user.repository
Core logic:
  - login
  - logout
  - refreshToken
  - validateSession
Risk: high
hash: abc123def456
```

## Real Results

Tested on **1,995 production code files** with Claude Haiku.

| Metric | Value |
|--------|-------|
| Token savings | **80.3%** |
| Summary quality | 100% |
| Files tested | 69 (full corpus extrapolated) |

```
Raw file (TypeScript):     ~690 tokens
ContextFS summary:          ~130 tokens
Savings:                   80% fewer tokens
```

**Every summary answers:** what the file does, what it exports, what it depends on, whether it's risky — without reading the raw file.

## Sample Summaries (Real Claude Haiku Output)

**auth-0001.ts:**
```
Purpose: Handles user registration with validation, password hashing, and token issuance
Exports: register, verifyEmail
Dependencies: bcrypt, jsonwebtoken, ./db/user.repository
Core logic:
  - Validates email and password strength before processing
  - Hashes password with bcrypt before storing
  - Issues JWT token on successful registration
  - Sends verification email via email service
Risk: high
```

**payment-0001.ts:**
```
Purpose: Processes payment intents with Stripe, validates amounts, and handles webhook events
Exports: createPaymentIntent, confirmPayment, handleWebhook
Dependencies: stripe, ./db/order.repository
Core logic:
  - Validates payment amount and currency
  - Creates Stripe PaymentIntent with correct metadata
  - Confirms and captures payment on confirmation
  - Handles Stripe webhook events for async completion
Risk: high
```

**order-0005.ts:**
```
Purpose: Cancels an order, refunds payment via Stripe, and updates inventory
Exports: cancelOrder, processRefund
Dependencies: stripe, ./db/order.repository, ./inventory.service
Core logic:
  - Validates order exists and is cancellable
  - Calls Stripe to refund payment
  - Restores inventory counts
  - Updates order status to cancelled
Risk: high
```

## ContextFS in Your Editor

After running `contextfs install` in a project:

1. The AI automatically reads ContextFS summaries when you ask about code
2. Every file save updates that file's summary silently in the background
3. New files are summarized automatically when created
4. Claude Code: the MCP server enforces summary-first reads — locked files require user approval

The MCP server intercepts file reads and returns `.summary` content automatically. Editor-specific rules (CLAUDE.md, `.cursor/rules/`, AGENTS.md) provide fallback enforcement.

## License

MIT
