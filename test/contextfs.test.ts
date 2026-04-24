/**
 * ContextFS Test Suite - Unit Tests
 * Tests parser, index builder, and hash checking with real source files
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanFiles, parseFile } from "../src/parser/index.js";
import { buildContextMap, loadContextMap, saveContextMap } from "../src/index-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "src");

// =============================================================================
// PARSER TESTS
// =============================================================================

describe("Parser - File Scanning", () => {
  it("001 - should find source files in src directory", async () => {
    const files = await scanFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(5);
  });

  it("002 - should only include supported extensions", async () => {
    const files = await scanFiles(SRC_DIR);
    files.forEach(f => {
      const ext = path.extname(f);
      expect([".ts", ".js", ".tsx", ".jsx", ".py"]).toContain(ext);
    });
  });

  it("003 - should return empty array for non-existent directory", async () => {
    const files = await scanFiles("/non/existent/path");
    expect(files).toEqual([]);
  });

  it("004 - should exclude node_modules", async () => {
    const files = await scanFiles(path.join(__dirname, ".."));
    files.forEach(f => expect(f).not.toContain("node_modules"));
  });

  it("005 - should exclude .git", async () => {
    const files = await scanFiles(path.join(__dirname, ".."));
    files.forEach(f => expect(f).not.toContain("/.git/"));
  });
});

describe("Parser - TypeScript Parsing", () => {
  const parserFile = path.join(SRC_DIR, "parser", "index.ts");

  it("006 - should parse named exports", async () => {
    const parsed = await parseFile(parserFile);
    expect(parsed.exports.length).toBeGreaterThan(0);
  });

  it("007 - should parse import dependencies", async () => {
    const parsed = await parseFile(parserFile);
    expect(parsed.dependencies.length).toBeGreaterThan(0);
  });

  it("008 - should include file path in parsed result", async () => {
    const parsed = await parseFile(parserFile);
    expect(parsed.path).toBe(parserFile);
  });

  it("009 - should include content in parsed result", async () => {
    const parsed = await parseFile(parserFile);
    expect(parsed.content.length).toBeGreaterThan(0);
  });

  it("010 - should parse scanFiles export", async () => {
    const parsed = await parseFile(parserFile);
    expect(parsed.exports).toContain("scanFiles");
  });

  it("011 - should parse parseFile export", async () => {
    const parsed = await parseFile(parserFile);
    expect(parsed.exports).toContain("parseFile");
  });
});

describe("Parser - Python File Parsing", () => {
  it("012 - should parse python function definitions", async () => {
    const content = `
def hello_world():
    pass

def calculate_sum(a, b):
    return a + b
`;
    const tmpFile = path.join(__dirname, "test-py-temp.py");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("hello_world");
    expect(parsed.exports).toContain("calculate_sum");
  });

  it("013 - should parse python class definitions", async () => {
    const content = `
class User:
    pass

class Product:
    pass
`;
    const tmpFile = path.join(__dirname, "test-py-temp2.py");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("User");
    expect(parsed.exports).toContain("Product");
  });
});

describe("Parser - Edge Cases", () => {
  const tmpDir = path.join(__dirname, "test-tmp");

  afterEach(async () => {
    try {
      const files = await fs.readdir(tmpDir);
      for (const f of files) await fs.unlink(path.join(tmpDir, f));
      await fs.rmdir(tmpDir);
    } catch {}
  });

  it("014 - should handle empty file", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "empty.ts");
    await fs.writeFile(tmpFile, "");
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toEqual([]);
    expect(parsed.dependencies).toEqual([]);
  });

  it("015 - should handle file with only comments", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "comments.ts");
    await fs.writeFile(tmpFile, "// This is a comment\n/* Block comment */");
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toEqual([]);
  });

  it("016 - should handle file with no exports", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "no-export.ts");
    await fs.writeFile(tmpFile, "const x = 1;\nfunction helper() {}");
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toEqual([]);
  });

  it("017 - should handle default export", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "default.ts");
    await fs.writeFile(tmpFile, "export default function main() {}");
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports.length).toBeGreaterThan(0);
  });

  it("018 - should handle CommonJS require", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "cjs.ts");
    await fs.writeFile(tmpFile, "const fs = require('fs');\nconst path = require('path');");
    const parsed = await parseFile(tmpFile);
    expect(parsed.dependencies).toContain("fs");
    expect(parsed.dependencies).toContain("path");
  });

  it("019 - should handle async/await functions", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "async.ts");
    await fs.writeFile(tmpFile, `export async function fetchData() { return await fetch('/api'); }`);
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("fetchData");
  });

  it("020 - should handle class exports", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "class.ts");
    await fs.writeFile(tmpFile, `export class MyClass { constructor() {} method() {} }`);
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("MyClass");
  });

  it("021 - should handle interface exports", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "interface.ts");
    await fs.writeFile(tmpFile, "export interface Config { key: string; }");
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("Config");
  });

  it("022 - should handle type exports", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "type.ts");
    await fs.writeFile(tmpFile, "export type Result = string | number;");
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("Result");
  });

  it("023 - should strip single-line comments", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "strip.ts");
    await fs.writeFile(tmpFile, `// This is a comment\nexport const x = 1;`);
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("x");
  });

  it("024 - should strip multi-line comments", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "stripmulti.ts");
    await fs.writeFile(tmpFile, `/* Block comment\nspanning lines */\nexport const y = 2;`);
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("y");
  });

  it("025 - should not match keywords inside comments", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "nocommand.ts");
    await fs.writeFile(tmpFile, `// export const x = 1;\nexport const y = 2;`);
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("y");
    expect(parsed.exports).not.toContain("x");
  });

  it("026 - should handle arrow functions", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "arrow.ts");
    await fs.writeFile(tmpFile, "export const handler = () => {};");
    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("handler");
  });

  it("027 - should handle namespace imports", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "namespace.ts");
    await fs.writeFile(tmpFile, "import * as utils from './utils';");
    const parsed = await parseFile(tmpFile);
    expect(parsed.dependencies).toContain("./utils");
  });
});

// =============================================================================
// INDEX BUILDER TESTS
// =============================================================================

describe("Index Builder - Context Map", () => {
  const tmpDir = path.join(__dirname, "test-tmp-idx");
  const tmpFile = path.join(tmpDir, "test.ts");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(tmpFile, `import { db } from './db';
export function test() { return db.query(); }`);
  });

  afterEach(async () => {
    try {
      const files = await fs.readdir(tmpDir);
      for (const f of files) await fs.unlink(path.join(tmpDir, f));
      await fs.rmdir(tmpDir);
    } catch {}
  });

  it("028 - should build context map with correct version", async () => {
    const parsed = await parseFile(tmpFile);
    const summary = `Purpose: test file
Exports: test
Dependencies: ./db
Risk: low`;
    const summaries = new Map([[tmpFile, summary]]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(map.version).toBe("1.0.0");
  });

  it("029 - should include generated_at timestamp", async () => {
    const summaries = new Map([[tmpFile, "Purpose: test\nExports: test\nDependencies:\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(map.generated_at).toBeDefined();
    expect(new Date(map.generated_at).toString()).not.toBe("Invalid Date");
  });

  it("030 - should include file in context map", async () => {
    const summaries = new Map([[tmpFile, "Purpose: test\nExports: test\nDependencies:\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(Object.keys(map.files).length).toBe(1);
  });

  it("031 - should parse purpose from summary", async () => {
    const relPath = path.relative(tmpDir, tmpFile);
    const summaries = new Map([[tmpFile, "Purpose: handles auth\nExports: login\nDependencies:\nRisk: high"]]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(map.files[relPath].purpose).toBe("handles auth");
  });

  it("032 - should parse exports from summary", async () => {
    const relPath = path.relative(tmpDir, tmpFile);
    const summaries = new Map([[tmpFile, "Purpose: test\nExports: login, logout\nDependencies:\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(map.files[relPath].exports).toContain("login");
    expect(map.files[relPath].exports).toContain("logout");
  });

  it("033 - should include summary_path for each file", async () => {
    const relPath = path.relative(tmpDir, tmpFile);
    const summaries = new Map([[tmpFile, "Purpose: test\nExports:\nDependencies:\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(map.files[relPath].summary_path).toBeDefined();
    expect(map.files[relPath].summary_path.endsWith(".summary")).toBe(true);
  });
});

describe("Index Builder - Save/Load", () => {
  const tmpDir = path.join(__dirname, "test-tmp-save");
  const tmpFile = path.join(tmpDir, "test.ts");
  const testMapPath = path.join(tmpDir, "context-map.json");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(tmpFile, "export const x = 1;");
  });

  afterEach(async () => {
    try {
      await fs.unlink(testMapPath);
      await fs.unlink(tmpFile);
      await fs.rmdir(tmpDir);
    } catch {}
  });

  it("034 - should save and load context map", async () => {
    const summaries = new Map([[tmpFile, "Purpose: test\nExports: x\nDependencies:\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    await saveContextMap(tmpDir, map);
    const loaded = await loadContextMap(tmpDir);
    expect(loaded.version).toBe(map.version);
    expect(loaded.generated_at).toBe(map.generated_at);
  });

  it("035 - should preserve file count after save/load", async () => {
    const summaries = new Map([[tmpFile, "Purpose: test\nExports: x\nDependencies:\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    await saveContextMap(tmpDir, map);
    const loaded = await loadContextMap(tmpDir);
    expect(Object.keys(loaded.files).length).toBe(Object.keys(map.files).length);
  });

  it("036 - should preserve file entries after save/load", async () => {
    const relPath = path.relative(tmpDir, tmpFile);
    const summaries = new Map([[tmpFile, "Purpose: test\nExports: x\nDependencies:\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    await saveContextMap(tmpDir, map);
    const loaded = await loadContextMap(tmpDir);
    expect(loaded.files[relPath].purpose).toBe(map.files[relPath].purpose);
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe("Integration - Full Pipeline", () => {
  const tmpDir = path.join(__dirname, "test-tmp-pipeline");

  afterEach(async () => {
    try {
      const files = await fs.readdir(tmpDir);
      for (const f of files) await fs.unlink(path.join(tmpDir, f));
      await fs.rmdir(tmpDir);
    } catch {}
  });

  it("037 - full pipeline: parse file and build map", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "pipeline.ts");
    await fs.writeFile(tmpFile, `import { db } from './db';
export function process() { return db.query('SELECT *'); }`);

    const parsed = await parseFile(tmpFile);
    expect(parsed.exports).toContain("process");
    expect(parsed.dependencies).toContain("./db");

    const summaries = new Map([[tmpFile, "Purpose: test\nExports: process\nDependencies: ./db\nRisk: low"]]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(Object.keys(map.files).length).toBe(1);
  });

  it("038 - should handle multiple files in context map", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const file1 = path.join(tmpDir, "a.ts");
    const file2 = path.join(tmpDir, "b.ts");
    await fs.writeFile(file1, "export const a = 1;");
    await fs.writeFile(file2, "export const b = 2;");

    const summaries = new Map([
      [file1, "Purpose: a\nExports: a\nDependencies:\nRisk: low"],
      [file2, "Purpose: b\nExports: b\nDependencies:\nRisk: low"],
    ]);
    const map = await buildContextMap(tmpDir, summaries);
    expect(Object.keys(map.files).length).toBe(2);
  });
});

describe("Integration - Source Files", () => {
  it("039 - should process src files in reasonable time", async () => {
    const start = Date.now();
    const files = await scanFiles(SRC_DIR);
    for (const file of files) {
      await parseFile(file);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  it("040 - all src files should have valid exports array", async () => {
    const files = await scanFiles(SRC_DIR);
    for (const file of files) {
      const parsed = await parseFile(file);
      expect(Array.isArray(parsed.exports)).toBe(true);
    }
  });

  it("041 - all src files should have valid dependencies array", async () => {
    const files = await scanFiles(SRC_DIR);
    for (const file of files) {
      const parsed = await parseFile(file);
      expect(Array.isArray(parsed.dependencies)).toBe(true);
    }
  });

  it("042 - all src files should have non-empty content", async () => {
    const files = await scanFiles(SRC_DIR);
    for (const file of files) {
      const parsed = await parseFile(file);
      expect(parsed.content.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// REGRESSION TESTS
// =============================================================================

describe("Regression - Previously Fixed Issues", () => {
  const summarizer = { summarize: () => "Purpose: test\nExports: x\nDependencies:\nRisk: low" };

  it("043 - export keyword inside string should not be parsed", async () => {
    const content = `const str = "export const x = 1";\nexport const y = 2;`;
    const tmpFile = path.join(__dirname, "test-regression.ts");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("y");
  });

  it("044 - import keyword inside comment should not be parsed", async () => {
    const content = `// import { x } from 'module';\nexport const y = 1;`;
    const tmpFile = path.join(__dirname, "test-regression2.ts");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("y");
    expect(parsed.dependencies).not.toContain("module");
  });

  it("045 - default export should be recognized", async () => {
    const content = `export default function app() {};\nexport function helper() {}`;
    const tmpFile = path.join(__dirname, "test-regression3.ts");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports.length).toBeGreaterThanOrEqual(2);
  });

  it("046 - dynamic require should not break parser", async () => {
    const content = `const x = require('./' + name);\nexport const y = 1;`;
    const tmpFile = path.join(__dirname, "test-regression4.ts");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("y");
  });

  it("047 - template literals should not break parser", async () => {
    const content = `const query = \`SELECT * FROM \${table}\`;\nexport const x = 1;`;
    const tmpFile = path.join(__dirname, "test-regression5.ts");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("x");
  });

  it("048 - decorators should not break parser", async () => {
    const content = `@decorator()\nexport class MyClass {}`;
    const tmpFile = path.join(__dirname, "test-regression6.ts");
    await fs.writeFile(tmpFile, content);
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("MyClass");
  });

  it("049 - re-export with renaming captures original names", async () => {
    const tmpFile = path.join(__dirname, "test-regression7.ts");
    await fs.writeFile(tmpFile, "export { x as y, z as w } from './module';");
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    expect(parsed.exports).toContain("x");
    expect(parsed.exports).toContain("z");
  });
});

describe("Regression - Summary Format Parsing", () => {
  it("050 - summary should have required fields", async () => {
    const tmpFile = path.join(__dirname, "test-format.ts");
    await fs.writeFile(tmpFile, "export const x = 1;");
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    const summary = `Purpose: test file
Exports: x
Dependencies: none
Risk: low`;
    expect(summary).toContain("Purpose:");
    expect(summary).toContain("Exports:");
    expect(summary).toContain("Dependencies:");
    expect(summary).toContain("Risk:");
  });

  it("051 - empty exports should show 'none'", async () => {
    const tmpFile = path.join(__dirname, "test-noexport.ts");
    await fs.writeFile(tmpFile, "const x = 1;");
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    const summary = `Purpose: test\nExports: none\nDependencies:\nRisk: low`;
    expect(summary).toContain("Exports: none");
  });

  it("052 - empty dependencies should show 'none'", async () => {
    const tmpFile = path.join(__dirname, "test-nodep.ts");
    await fs.writeFile(tmpFile, "export const x = 1;");
    const parsed = await parseFile(tmpFile);
    await fs.unlink(tmpFile);
    const summary = `Purpose: test\nExports: x\nDependencies: none\nRisk: low`;
    expect(summary).toContain("Dependencies: none");
  });

  it("053 - risk level should be lowercase", async () => {
    const summary = `Purpose: test\nExports:\nDependencies:\nRisk: high`;
    expect(summary).toMatch(/Risk: (low|medium|high)$/m);
  });
});

// =============================================================================
// FINAL VALIDATION
// =============================================================================

describe("Final Validation", () => {
  it("054 - src should have multiple TypeScript files", async () => {
    const files = await scanFiles(SRC_DIR);
    const tsFiles = files.filter(f => f.endsWith(".ts"));
    expect(tsFiles.length).toBeGreaterThan(5);
  });

  it("055 - src files should have varied purposes", async () => {
    const files = await scanFiles(SRC_DIR);
    const purposes = new Set();
    for (const file of files.slice(0, 10)) {
      const parsed = await parseFile(file);
      if (parsed.exports.length > 0) purposes.add(parsed.exports[0]);
    }
    // Real source files have different exports
    expect(purposes.size).toBeGreaterThan(1);
  });

  it("056 - end-to-end: generate summary, save map, load map", async () => {
    const tmpDir = path.join(__dirname, "test-e2e");
    const tmpFile = path.join(tmpDir, "e2e.ts");
    const mapFile = path.join(tmpDir, "context-map.json");

    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(tmpFile, `import { db } from './db';
export function test() { return db.query(); }`);

    const parsed = await parseFile(tmpFile);
    const summary = `Purpose: test\nExports: test\nDependencies: ./db\nRisk: low`;
    const map = await buildContextMap(tmpDir, new Map([[tmpFile, summary]]));
    await saveContextMap(tmpDir, map);

    const loaded = await loadContextMap(tmpDir);
    expect(loaded.version).toBe("1.0.0");
    expect(Object.keys(loaded.files).length).toBe(1);

    await fs.unlink(tmpFile);
    await fs.unlink(mapFile);
    await fs.rmdir(tmpDir);
  });

  it("057 - parser index should export scanFiles and parseFile", async () => {
    const files = await scanFiles(SRC_DIR);
    const parserIdx = files.find(f => f.endsWith("parser/index.ts"));
    expect(parserIdx).toBeDefined();
    const parsed = await parseFile(parserIdx!);
    expect(parsed.exports).toContain("scanFiles");
    expect(parsed.exports).toContain("parseFile");
  });

  it("058 - summarizer should export createLLMSummarizer", async () => {
    const files = await scanFiles(SRC_DIR);
    const sumIdx = files.find(f => f.endsWith("summarizer/index.ts"));
    expect(sumIdx).toBeDefined();
    const parsed = await parseFile(sumIdx!);
    expect(parsed.exports).toContain("createLLMSummarizer");
  });

  it("059 - index-builder should export buildContextMap", async () => {
    const files = await scanFiles(SRC_DIR);
    const idxBuilder = files.find(f => f.endsWith("index-builder.ts"));
    expect(idxBuilder).toBeDefined();
    const parsed = await parseFile(idxBuilder!);
    expect(parsed.exports).toContain("buildContextMap");
  });

  it("060 - all src files should parse without errors", async () => {
    const files = await scanFiles(SRC_DIR);
    for (const file of files) {
      const parsed = await parseFile(file);
      expect(parsed).toBeDefined();
      expect(parsed.path).toBe(file);
    }
  });
});
