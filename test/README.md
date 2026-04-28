# ContextFS Test Suite

Real LLM tests using Claude Opus with production code files.

## Quick Demo (30 seconds)

Want to see it work? Run the demo with 5 files:

```bash
ANTHROPIC_API_KEY=sk-... npx tsx test/demo.ts
```

This shows original file → summary for 5 files and prints token savings.

## Full Test (1,995 files)

```bash
ANTHROPIC_API_KEY=sk-... npx tsx test/quality-2000.ts
```

Features:
- Shows original + summary for every file
- Retry logic with exponential backoff for API errors
- Progress tracking every 10 files

## Generate Test Files

If you need to regenerate the 1,995 mock files:

```bash
npx tsx test/generate-2000.ts
```

## Test Results

### Real LLM Test (Claude Opus 4.6 pricing)
- **Token savings:** 80.3%
- **Quality:** 100% of summaries answer all questions
- **Partial run:** 69/1995 files completed (API outage halted test)
- **Full results:** `test/PARTIAL_RESULTS_69files.txt`
