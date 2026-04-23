/**
 * Data processing engine - 500 lines of complex business logic
 */

interface DataRecord {
  id: string;
  timestamp: number;
  value: number;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface ProcessingConfig {
  batchSize: number;
  parallelWorkers: number;
  retryFailed: boolean;
  dedupEnabled: boolean;
  enrichData: boolean;
  normalizer?: "minmax" | "zscore" | "none";
  filters: FilterRule[];
  aggregations: AggregationConfig[];
}

interface FilterRule {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: unknown;
}

interface AggregationConfig {
  name: string;
  field: string;
  function: "sum" | "avg" | "min" | "max" | "count" | "median" | "stddev";
  groupBy?: string[];
}

export class DataProcessor {
  private config: ProcessingConfig;
  private cache: Map<string, DataRecord[]>;
  private stats: ProcessingStats;

  constructor(config: ProcessingConfig) {
    this.config = config;
    this.cache = new Map();
    this.stats = this.initStats();
  }

  async process(records: DataRecord[]): Promise<ProcessedResult> {
    const startTime = Date.now();
    let processed = records;

    if (this.config.dedupEnabled) {
      processed = this.deduplicate(processed);
    }

    if (this.config.filters.length > 0) {
      processed = this.applyFilters(processed);
    }

    if (this.config.normalizer && this.config.normalizer !== "none") {
      processed = this.normalize(processed);
    }

    if (this.config.enrichData) {
      processed = await this.enrich(processed);
    }

    const batches = this.chunk(processed, this.config.batchSize);
    const aggregated = this.aggregate(processed);

    return {
      records: processed,
      aggregated,
      stats: {
        ...this.stats,
        totalRecords: records.length,
        processedRecords: processed.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  private deduplicate(records: DataRecord[]): DataRecord[] {
    const seen = new Set<string>();
    return records.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  private applyFilters(records: DataRecord[]): DataRecord[] {
    return records.filter(record => {
      return this.config.filters.every(filter => this.evaluateFilter(record, filter));
    });
  }

  private evaluateFilter(record: DataRecord, filter: FilterRule): boolean {
    const value = this.getNestedValue(record, filter.field);
    switch (filter.operator) {
      case "eq": return value === filter.value;
      case "ne": return value !== filter.value;
      case "gt": return typeof value === "number" && value > (filter.value as number);
      case "gte": return typeof value === "number" && value >= (filter.value as number);
      case "lt": return typeof value === "number" && value < (filter.value as number);
      case "lte": return typeof value === "number" && value <= (filter.value as number);
      case "contains": return String(value).includes(String(filter.value));
      case "in": return Array.isArray(filter.value) && filter.value.includes(value);
      default: return true;
    }
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split(".").reduce((acc: unknown, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private normalize(records: DataRecord[]): DataRecord[] {
    const values = records.map(r => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (this.config.normalizer === "minmax") {
      return records.map(r => ({
        ...r,
        value: max === min ? 0.5 : (r.value - min) / (max - min),
      }));
    }

    if (this.config.normalizer === "zscore") {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      const stddev = Math.sqrt(variance);
      return records.map(r => ({
        ...r,
        value: stddev === 0 ? 0 : (r.value - mean) / stddev,
      }));
    }

    return records;
  }

  private async enrich(records: DataRecord[]): Promise<DataRecord[]> {
    return Promise.all(records.map(async r => ({
      ...r,
      metadata: {
        ...r.metadata,
        enriched: true,
        processedAt: Date.now(),
        confidence: await this.calculateConfidence(r),
      },
    })));
  }

  private async calculateConfidence(record: DataRecord): Promise<number> {
    let score = 0.5;
    if (record.tags.length > 0) score += 0.1;
    if (record.metadata && Object.keys(record.metadata).length > 0) score += 0.2;
    if (record.value > 0) score += 0.1;
    if (record.timestamp > Date.now() - 86400000) score += 0.1;
    return Math.min(1, score);
  }

  private aggregate(records: DataRecord[]): Record<string, number> {
    const result: Record<string, number> = {};

    for (const agg of this.config.aggregations) {
      const values = records.map(r => this.getNestedValue(r, agg.field) as number).filter(v => !isNaN(v));

      switch (agg.function) {
        case "sum":
          result[agg.name] = values.reduce((a, b) => a + b, 0);
          break;
        case "avg":
          result[agg.name] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case "min":
          result[agg.name] = values.length > 0 ? Math.min(...values) : 0;
          break;
        case "max":
          result[agg.name] = values.length > 0 ? Math.max(...values) : 0;
          break;
        case "count":
          result[agg.name] = values.length;
          break;
        case "median":
          result[agg.name] = this.percentile(values, 50);
          break;
        case "stddev":
          if (values.length > 0) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
            result[agg.name] = Math.sqrt(variance);
          }
          break;
      }
    }

    return result;
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const sorted = [...sortedValues].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private initStats(): ProcessingStats {
    return {
      totalRecords: 0,
      processedRecords: 0,
      failedRecords: 0,
      duplicateRemoved: 0,
      filteredRemoved: 0,
      durationMs: 0,
    };
  }
}

interface ProcessingStats {
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  duplicateRemoved: number;
  filteredRemoved: number;
  durationMs: number;
}

interface ProcessedResult {
  records: DataRecord[];
  aggregated: Record<string, number>;
  stats: ProcessingStats;
}

// Utility functions
export function createProcessor(config: Partial<ProcessingConfig>): DataProcessor {
  return new DataProcessor({
    batchSize: config.batchSize ?? 1000,
    parallelWorkers: config.parallelWorkers ?? 4,
    retryFailed: config.retryFailed ?? true,
    dedupEnabled: config.dedupEnabled ?? true,
    enrichData: config.enrichData ?? false,
    normalizer: config.normalizer ?? "none",
    filters: config.filters ?? [],
    aggregations: config.aggregations ?? [],
  });
}

export function validateConfig(config: ProcessingConfig): string[] {
  const errors: string[] = [];
  if (config.batchSize <= 0) errors.push("batchSize must be positive");
  if (config.parallelWorkers <= 0) errors.push("parallelWorkers must be positive");
  if (!["minmax", "zscore", "none"].includes(config.normalizer ?? "none")) {
    errors.push("normalizer must be minmax, zscore, or none");
  }
  return errors;
}
