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

ContextFS summaries are plain text — any AI coding tool can read them.

- **Claude Code** — Full integration (auto-hook + CLAUDE.md rules)
- **Cursor** — Run `contextfs build`, then tell Cursor to read `.summary` files
- **Codex/OpenAI** — Same as above
- **Any editor** — `contextfs query` finds files, `.summary` files are universally readable

## Install

Works with Claude Code, Cursor, Codex, and any AI editor.

```bash
curl -fsSL https://raw.githubusercontent.com/nanaubusiness/contextfs/main/install.sh | sh
cd your-project
contextfs init   # Claude Code gets full integration; others: just run build
```

The script clones the repo and extracts the pre-built binary — no npm or build step required.

**Requirements:** Node.js 18+

## Claude Code Commands

```
/contextfs build         Summarize your entire codebase (Claude Haiku)
/contextfs init         Set up in a new project
/contextfs query <text> Find files related to a topic
/contextfs demo <file>  Preview summaries on any file
```

**Rule:** Before reading any code file, query ContextFS first.

## What You Get

- **After install:** Run `/contextfs build` — Claude Haiku summarizes every file once
- **Every save:** The FileChanged hook auto-updates only that file's summary
- **Every question:** Claude reads summaries first, raw files only when needed

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

## ContextFS in Claude Code

After running `contextfs init` in a project:

1. Claude Code automatically uses ContextFS summaries when you ask about code
2. Every file save updates that file's summary silently in the background
3. New files are summarized automatically when created
4. Claude reads raw files only when the summary isn't detailed enough

The `CLAUDE.md` rules in your project tell Claude: "always query ContextFS before reading raw files."

## License

MIT
