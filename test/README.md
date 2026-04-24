# ContextFS Test Suite

This directory contains tests that demonstrate ContextFS token savings.

## Quick Start

```bash
npm run test          # Basic token measurement
npm run test:100      # 100 file quality consistency test
npm run test:compare   # Realistic scenario comparison
npm run test:llm      # Real LLM API test (needs API key)
npm run generate:100  # Regenerate 100 test files
```

## Test Files

### Mock Projects
| Directory | Files | Description |
|-----------|-------|-------------|
| `mock-projectsmall/` | 2 | Tiny files (~50 lines each) |
| `mock-projectmedium/` | 1 | Medium file (~185 lines) |
| `mock-projectlarge/` | 1 | Large file (~274 lines) |
| `mock-projectxlarge/` | 1 | XL file (~590 lines) |
| `mock-project100/` | 100 | Auto-generated files for quality testing |

### Test Scripts

#### `run-tests.ts` - Basic Token Measurement
Measures raw file sizes vs summary sizes and estimates token savings.
```bash
npm run test
```

#### `quality-100.ts` - 100 File Quality Test
Tests summary quality consistency across 100 files.
```bash
npm run test:100
```
**Results (100 files):**
- 100% Purpose field coverage
- 100% Risk field coverage
- 100% Export detection accuracy
- 82% average token savings
- Std deviation: 10.4% (consistent quality)

#### `comparison-test.ts` - Realistic Scenarios
Simulates real AI coding tool usage patterns.
```bash
npm run test:compare
```

#### `llm-token-test.ts` - Real LLM Token Test
Uses actual Anthropic API. Requires `ANTHROPIC_API_KEY`.
```bash
npm run test:llm
```

#### `generate-100.ts` - Regenerate Test Files
Creates 100 new mock source files.
```bash
npm run generate:100
```

## Expected Results

### Small Files (~50 lines)
| Metric | Value |
|--------|-------|
| Raw tokens | ~200 |
| Summary tokens | ~50 |
| Savings | ~75% |

### Large Files (~500 lines)
| Metric | Value |
|--------|-------|
| Raw tokens | ~2,000 |
| Summary tokens | ~200 |
| Savings | ~90% |

### 100 File Quality Test
| Metric | Value |
|--------|-------|
| Files tested | 100 |
| Average savings | 82% |
| Min savings | 52% |
| Max savings | 86% |
| Std deviation | 10.4% |
| Purpose coverage | 100% |
| Risk coverage | 100% |

## Cost Savings

At Haiku pricing ($0.80/M input tokens):

| Scenario | Raw Cost | Summary Cost | Savings |
|----------|----------|--------------|---------|
| 100 files, 1 session | $0.035 | $0.006 | 83% |
| 100 files, 10 sessions | $0.35 | $0.06 | 83% |
| 100 files, 100 sessions | $3.51 | $0.62 | 82% |

**Summary generation is one-time. Subsequent sessions only pay for reading summaries.**
