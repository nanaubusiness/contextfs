export interface FileSummaryEntry {
  summary_path: string;
  purpose: string;
}

export interface ContextMap {
  files: Record<string, FileSummaryEntry>;
  generated_at: string;
  version: string;
}

export interface ParsedFile {
  path: string;
  exports: string[];
  dependencies: string[];
  content: string;
}

export interface BuildOptions {
  rootDir: string;
  skipHashCheck: boolean;
  useMockLLM: boolean;
  anthropicApiKey?: string;
}
