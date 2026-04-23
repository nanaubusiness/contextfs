# ContextFS Test Suite

This directory contains tests that demonstrate ContextFS token savings.

## Test Files

### Mock Projects
- `mock-projectsmall/` - 2 files, ~50 lines each
- `mock-projectmedium/` - 1 file, ~300 lines
- `mock-projectlarge/` - 1 file, ~500 lines
- `mock-projectxlarge/` - 1 file, ~1200 lines

### Test Scripts

#### `run-tests.ts` - Basic Token Measurement
Measures raw file sizes vs summary sizes and estimates token savings.

```bash
npm run test
```

Output:
- Token counts for raw files vs summaries
- Percentage savings per file and project
- Cost estimation at Claude API pricing

#### `comparison-test.ts` - Realistic Scenario Comparison
Simulates real AI coding tool usage patterns:
- Quick lookups (2 files)
- Feature implementation (5 files)
- Code review (10 files)
- Refactoring (10 files, multiple passes)

```bash
npm run test:compare
```

Output:
- Per-session costs for raw vs summary approach
- Cumulative savings across scenarios
- Amortized savings over multiple sessions

#### `llm-token-test.ts` - Real LLM Token Test
Uses the actual Anthropic API to measure real token usage.
**Requires `ANTHROPIC_API_KEY` environment variable.**

```bash
npm run test:llm
# or
ANTHROPIC_API_KEY=sk-ant-... npm run test:llm
```

Output:
- Real input/output token counts from API
- Actual dollar costs
- Token savings percentages

## Expected Results

Typical savings per file:
| File Size | Raw Tokens | Summary Tokens | Savings |
|-----------|-----------|----------------|---------|
| Small (~50 lines) | ~200 | ~50 | ~75% |
| Medium (~300 lines) | ~1,200 | ~150 | ~88% |
| Large (~500 lines) | ~2,000 | ~200 | ~90% |
| XL (~1200 lines) | ~4,800 | ~250 | ~95% |

## How It Works

1. **Mock summarizer** creates summaries based on heuristics (exports, imports, risk level)
2. **LLM summarizer** uses Claude Haiku to generate richer summaries
3. **Token estimation** uses 4 chars/token (typical for code)
4. **Real API** returns actual token counts from response metadata

## Adding Test Files

Create new mock source files in the appropriate `mock-project*/` directory:
- TypeScript files (`.ts`, `.tsx`)
- JavaScript files (`.js`, `.jsx`)
- Python files (`.py`)

The scanner automatically picks them up when you run tests.
