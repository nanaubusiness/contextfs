import * as fs from "fs/promises";
import * as path from "path";
import { ParsedFile } from "../types.js";

const SUPPORTED_EXTENSIONS = new Set([".ts", ".js", ".tsx", ".jsx", ".py"]);

export async function scanFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(rootDir);
  return files;
}

export async function parseFile(filePath: string): Promise<ParsedFile> {
  const content = await fs.readFile(filePath, "utf-8");
  const ext = path.extname(filePath);

  if (ext === ".py") {
    return parsePython(content, filePath);
  }

  return parseJSTS(content, filePath);
}

function parsePython(content: string, filePath: string): ParsedFile {
  const exports: string[] = [];
  const dependencies: string[] = [];

  // Match function definitions: def function_name(
  const funcMatches = content.matchAll(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm);
  for (const match of funcMatches) {
    exports.push(match[1]);
  }

  // Match class definitions: class ClassName:
  const classMatches = content.matchAll(/^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm);
  for (const match of classMatches) {
    exports.push(match[1]);
  }

  // Match imports: from module import X or import module
  const importMatches = content.matchAll(
    /^(?:from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import|import\s+([a-zA-Z_][a-zA-Z0-9_.]*))/gm
  );
  for (const match of importMatches) {
    const dep = match[1] || match[2];
    if (dep && !dep.startsWith(".")) {
      dependencies.push(dep);
    }
  }

  return { path: filePath, exports, dependencies, content };
}

function stripComments(code: string): string {
  // Remove single-line comments
  let stripped = code.replace(/\/\/[^\n]*/g, "");
  // Remove multi-line comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
  return stripped;
}

function parseJSTS(content: string, filePath: string): ParsedFile {
  const exports: string[] = [];
  const dependencies: string[] = [];
  const seenExports = new Set<string>();

  // Strip comments to avoid matching export keywords inside comments
  const code = stripComments(content);

  // Match named exports: export const/function/class/let/var name
  const keywordExportRE =
    /export\s+(?:default\s+)?(?:const|function|class|interface|type|async\s+function|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  for (const match of code.matchAll(keywordExportRE)) {
    if (match[1] && !seenExports.has(match[1])) {
      seenExports.add(match[1]);
      exports.push(match[1]);
    }
  }

  // Match named object exports: export { foo, bar as baz }
  const namedExportRE = /export\s+\{\s*([^}]+)\s*\}/g;
  for (const match of code.matchAll(namedExportRE)) {
    const names = match[1].split(",").map((n) => {
      const parts = n.trim().split(/\s+as\s+/);
      return parts[0].trim();
    });
    for (const name of names) {
      if (name && !name.startsWith("*") && !seenExports.has(name)) {
        seenExports.add(name);
        exports.push(name);
      }
    }
  }

  // Match default export: export default name
  const defaultExportRE = /export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  for (const match of code.matchAll(defaultExportRE)) {
    if (match[1] && !seenExports.has(match[1])) {
      seenExports.add(match[1]);
      exports.push(match[1]);
    }
  }

  // Match import declarations: import { name } from 'module' or import name from 'module'
  const importMatches = code.matchAll(
    /import\s+(?:\{[^}]+\}|[a-zA-Z_$][a-zA-Z0-9_$]*|\* as \w+)\s+from\s+['"]([^'"]+)['"]/g
  );
  for (const match of importMatches) {
    dependencies.push(match[1]);
  }

  // Match CommonJS require: const/let/var name = require('module')
  const requireMatches = code.matchAll(
    /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  );
  for (const match of requireMatches) {
    dependencies.push(match[2]);
  }

  return { path: filePath, exports, dependencies, content };
}
