# ContextFS

> Less context. Less tokens. Less money.

ContextFS generates plain-text summaries of your codebase — once. Then any AI reads summaries instead of raw files. Same understanding, a fraction of the token cost.

## How It Works

```
You ask about auth code
  → AI queries ContextFS summaries
  → Reads 5-line summaries instead of 500-line files
  → Uses ~81% fewer tokens
```

**Claude Code users:** No API key needed. Your subscription token is used automatically.

## Works With Your Editor

ContextFS summaries are plain text — any AI coding tool can read them. Claude Code gets a native MCP server that intercepts file reads and returns summary content instead of raw code. Other editors get automatic updates on file save via a background watcher.

| Editor | Integration | Auto-update |
|--------|-------------|-------------|
| **Claude Code** | MCP server | Yes — built in |
| **Cursor** | MCP server | Yes |
| **Codex** | MCP server | Yes |
| **VS Code** | MCP server | Yes |

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nanaubusiness/contextfs/main/install.sh | sh
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
contextfs compact               Compact session history into a structured summary
```

**`contextfs mcp`** — Runs an MCP server over stdio. When connected to Claude Code (or other MCP-compatible editors), it intercepts every file read and returns `.summary` content when available. Files without summaries trigger a user approval prompt.

**`contextfs compact`** — Reads conversation history, generates a structured session summary: files discussed, decisions made, open questions, and next steps. Run manually or trigger via Claude Code's FileChanged hook.

**Rule:** Before reading any code file, query ContextFS first.

## What You Get

- **After install:** `contextfs build` — Claude Opus summarizes every file once
- **Every save:** Background watcher auto-updates that file's summary
- **Claude Code:** MCP server returns `.summary` content automatically. Locked files (no summary) require your approval before raw access.
- **Other editors:** Summaries update automatically on save. AI reads summaries when you query `contextfs query`.

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

Tested on **1,995 production code files** with Claude Opus.

| Metric | Value |
|--------|-------|
| Token savings | **~81%** |
| Summary quality | High — every summary covers purpose, exports, dependencies, and risk |

```
Raw file (TypeScript):     ~690 tokens
ContextFS summary:          ~130 tokens
Savings:                   ~81% fewer tokens
```

**Every summary answers:** what the file does, what it exports, what it depends on, whether it's risky — without reading the raw file.

## Sample Summaries (Real Claude Opus Output)

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
4. Claude Code: the MCP server intercepts file reads and returns `.summary` content. Other editors: summaries update on save, AI uses `contextfs query` to find relevant files.

## License

MIT
