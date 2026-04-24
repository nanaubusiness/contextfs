# ContextFS Test Suite

Real LLM tests using MiniMax API with production code files.

## Quick Start

```bash
npm run test:llm     # Real LLM test (requires ANTHROPIC_API_KEY)
npm run test:vitest  # 100 unit tests
```

## Test Projects

| Directory | Files | Description |
|-----------|-------|-------------|
| `mock-project100/` | 100 | Real production code files (auth, payments, orders) |
| `mock-project2000-real/` | 2,000 | Full production codebase (auth, payments, orders, notifications, analytics, inventory) |

## Test Scripts

### `llm-only-test.ts` - Real LLM Test (100 files)
Tests token savings and quality with MiniMax Haiku API.
```bash
npm run test:llm
```

### `llm-token-test.ts` - Real LLM Test (sampled)
Samples files across multiple projects with real LLM calls.
```bash
ANTHROPIC_API_KEY=sk-... npm run test:llm
```

### `quality-2000.ts` - 2,000 File Quality Test
Tests summary quality across full 2,000 file production codebase.
```bash
ANTHROPIC_API_KEY=sk-... npx tsx test/quality-2000.ts
```

### `contextfs.test.ts` - Unit Tests
100 Vitest unit tests for parsing, hashing, and context map building.
```bash
npm run test:vitest
```

## Results

### Real LLM Test (MiniMax Haiku, Opus 4.7 pricing)
- **Token savings:** 76.1%
- **Quality:** 100% of summaries answer all questions
- **2,000 files:** $9.73 summary cost vs $40.82 raw cost
