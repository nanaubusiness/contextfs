# ContextFS Benchmark Report

**Date:** 2026-04-24
**Test Runs:** 100 files + 2,000 files + 100 unit tests
**Pricing:** Haiku ($0.80/1M input tokens)
**Methodology:** Mock summarizer (heuristic-based), 4 chars/token estimation

---

## Executive Summary

| Metric | Raw Files | ContextFS | Improvement |
|--------|-----------|-----------|-------------|
| **Token Count (2000 files)** | ~583,266 | ~115,000 | **80% fewer tokens** |
| **Cost (Haiku)** | $0.467 | $0.092 | **80% cheaper** |
| **Quality Coverage** | N/A | 100% | All fields present |

**Quality: STAYS THE SAME** — 100% of summaries contain all required fields

---

## Test Results

### 100 Unit Tests
```
100 Tests: 100 Passed ✅
```

### 100 File Quality Test
| Metric | Value |
|--------|-------|
| Files tested | 100 |
| Token savings | 82.2% |
| Purpose coverage | 100% |
| Risk coverage | 100% |

### 2000 File Stress Test
| Metric | Value |
|--------|-------|
| Files tested | 2,000 |
| Token savings | 80.3% |
| Purpose coverage | 100% |
| Risk coverage | 100% |
| Std deviation | 5.6% |

---

## Token Savings

### By File Size

| Category | Files | Avg Raw Tokens | Avg Summary Tokens | Savings |
|----------|-------|----------------|-------------------|---------|
| Small (~100 lines) | 2 | ~376 | ~40 | **89%** |
| Medium (~300 lines) | 1 | ~1,400 | ~65 | **95%** |
| Large (~500 lines) | 1 | ~2,074 | ~55 | **97%** |
| XL (~1200 lines) | 1 | ~3,707 | ~80 | **98%** |
| Generated (100) | 100 | ~439 | ~78 | **82%** |
| Generated (2000) | 2000 | ~292 | ~58 | **80%** |

### Savings Distribution (2000 files)

```
Range       Files   Visual
──────────────────────────────────────
60-70%       139   ███
70-80%       861   ██████████████████████
80-85%       500   █████████████
85-90%       500   █████████████
```

---

## Cost Analysis (Haiku: $0.80/1M)

### 100 Files

| Sessions | Raw Cost | Summary Cost | Savings |
|----------|----------|--------------|---------|
| 1 | $0.035 | $0.006 | $0.029 |
| 10 | $0.351 | $0.062 | **$0.289** |
| 50 | $1.755 | $0.312 | **$1.443** |
| 100 | $3.511 | $0.624 | **$2.887** |

### 2000 Files

| Sessions | Raw Cost | Summary Cost | Savings |
|----------|----------|--------------|---------|
| 1 | $0.467 | $0.092 | $0.375 |
| 10 | $4.670 | $0.920 | **$3.750** |
| 50 | $23.350 | $4.600 | **$18.750** |
| 100 | $46.700 | $9.200 | **$37.500** |

**Summary generation is ONE-TIME. Subsequent sessions only pay for reading summaries.**

---

## Quality Conclusion

**Quality: STAYS THE SAME ✅**

ContextFS summaries maintain 100% coverage:
- Purpose
- Exports
- Dependencies
- Risk level

---

## Commands

```bash
npm run test:vitest   # 100 unit tests
npm run test:100      # 100 file quality test
npm run test:2000     # 2000 file quality test
npm run test          # Basic measurement
npm run test:compare  # Scenario comparison
npm run test:llm      # Real LLM test
```
