import * as fs from "fs/promises";
import * as path from "path";
import { ParsedFile } from "../types.js";

const SUPPORTED_EXTENSIONS = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".md"]);

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".claude",
  "__pycache__",
  ".venv",
  "venv",
  ".next",       // Next.js production build
  ".nuxt",        // Nuxt.js build output
  ".output",      // Nuxt/Nitro output
  ".svelte-kit",  // SvelteKit build
  ".vercel",      // Vercel build
  ".turbo",       // Turborepo cache
  "coverage",     // Test coverage reports
  ".cache",       // General cache
  ".parcel-cache", // Parcel cache
  ".yarn",        // Yarn cache
]);

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
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
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

export async function parseFile(filePath: string, preReadContent?: string): Promise<ParsedFile> {
  const raw = preReadContent ?? await fs.readFile(filePath, "utf-8");
  // Strip UTF-8 BOM if present — it breaks regex anchors like ^Purpose:
  const content = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const ext = path.extname(filePath);

  if (ext === ".py") {
    return parsePython(content, filePath);
  }

  if (ext === ".md") {
    return parseMarkdown(content, filePath);
  }

  return parseJSTS(content, filePath);
}

function parsePython(content: string, filePath: string): ParsedFile {
  const exports: string[] = [];
  const dependencies: string[] = [];

  // Match function definitions: def function_name(...) — multiline-safe
  // Handles: def foo():, def foo(x: int):, def foo(\n  param,\n):, async def foo(), def foo(bar(x)):
  const funcMatches = content.matchAll(/^(\basync\b\s*)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((?:[^()]+|\([^()]*\))*\)/gm);
  for (const match of funcMatches) {
    exports.push(match[2]); // group 2 is the function name
  }

  // Match class definitions: class ClassName: (also handles class Foo(Bar):)
  const classMatches = content.matchAll(/^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm);
  for (const match of classMatches) {
    exports.push(match[1]);
  }

  // Match imports: from module import X or import module or from module import (x, y)
  const importMatches = content.matchAll(
    /^(?:from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import|import\s+([a-zA-Z_][a-zA-Z0-9_.]*))/gm
  );
  for (const match of importMatches) {
    const dep = match[1] || match[2];
    if (dep && !dep.startsWith(".")) {
      dependencies.push(dep);
    }
  }

  // Match re-exports: export from 'module' (Python 3+)
  const reExportMatches = content.matchAll(/^from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import\s+\*/gm);
  for (const match of reExportMatches) {
    if (match[1] && !match[1].startsWith(".")) {
      dependencies.push(match[1]);
    }
  }

  return { path: filePath, exports, dependencies, content };
}

function stripComments(code: string): string {
  // Properly strip comments WITHOUT destroying strings or regex literals.
  // Iterates char-by-char, tracks whether inside string/regex, and only removes
  // comment characters that are actually in comment context.
  let result = "";
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // Single-line comment: //
    if (ch === "/" && code[i + 1] === "/") {
      // Skip until end of line
      while (i < len && code[i] !== "\n") i++;
      i++; // skip the newline (or we'll add it below via result+=ch)
      continue;
    }

    // Multi-line comment: /* */
    if (ch === "/" && code[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < len - 1 && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2; // skip */
      continue;
    }

    // String literal: "..." or '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      result += ch;
      i++;
      while (i < len) {
        const sc = code[i];
        if (sc === "\\" && i + 1 < len) {
          // Escaped character — include both escape and the escaped char
          result += code[i] + code[i + 1];
          i += 2;
        } else if (sc === quote) {
          result += sc;
          i++;
          break;
        } else {
          result += sc;
          i++;
        }
      }
      continue;
    }

    // Template literal: `...`
    if (ch === "`") {
      result += ch;
      i++;
      while (i < len) {
        const tc = code[i];
        if (tc === "\\" && i + 1 < len) {
          result += code[i] + code[i + 1];
          i += 2;
        } else if (tc === "`") {
          result += tc;
          i++;
          break;
        } else {
          result += tc;
          i++;
        }
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

function parseJSTS(content: string, filePath: string): ParsedFile {
  const exports: string[] = [];
  const dependencies: string[] = [];
  const seenExports = new Set<string>();

  // Strip comments to avoid matching export keywords inside comments
  const code = stripComments(content);

  // Match named exports: export const/function/class/let/var name, and async const/let/var
  const keywordExportRE =
    /export\s+(?:default\s+)?(?:const|function|class|interface|type|async\s+function|async\s+(?:const|let|var)|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
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

  // Match import declarations: import { name } from 'module' or import name from 'module' or import type { Foo }
  const importMatches = code.matchAll(
    /import\s+(?:type\s+)?(?:\{[^}]+\}|[a-zA-Z_$][a-zA-Z0-9_$]*|\* as \w+)\s+from\s+['"]([^'"]+)['"]/g
  );
  for (const match of importMatches) {
    dependencies.push(match[1]);
  }

  // Match side-effect imports: import 'module' or import "module" (no from clause)
  const sideEffectImportMatches = code.matchAll(/import\s+['"]([^'"]+)['"]/g);
  for (const match of sideEffectImportMatches) {
    if (!dependencies.includes(match[1])) {
      dependencies.push(match[1]);
    }
  }

  // Match CommonJS require: const/let/var name = require('module')
  const requireMatches = code.matchAll(
    /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  );
  for (const match of requireMatches) {
    dependencies.push(match[2]);
  }

  // Match re-exports: export * from 'module' or export { foo } from 'module'
  const reExportMatches = code.matchAll(
    /export\s+(?:\*\s+from\s+['"]([^'"]+)['"]|\{\s*[^}]+\s*\}\s+from\s+['"]([^'"]+)['"])/g
  );
  for (const match of reExportMatches) {
    const dep = match[1] || match[2];
    if (dep) dependencies.push(dep);
  }

  return { path: filePath, exports, dependencies, content };
}

function parseMarkdown(content: string, filePath: string): ParsedFile {
  const exports: string[] = [];
  const dependencies: string[] = [];

  // Extract markdown headings as section identifiers
  const headingMatches = content.matchAll(/^#{1,3}\s+(.+)/gm);
  for (const match of headingMatches) {
    const heading = match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    exports.push(heading);
  }

  // Extract @mentions (e.g. @context/me.md) as dependencies
  const mentionMatches = content.matchAll(/@[\w./]+/g);
  for (const match of mentionMatches) {
    const dep = match[0].slice(1);
    if (!dep.startsWith("http")) {
      dependencies.push(dep);
    }
  }

  // Extract link URLs as dependencies (stop at common trailing punctuation)
  const linkMatches = content.matchAll(/\[([^\]]+)\]\(([^\s.,;:!?)]+)\)/g);
  for (const match of linkMatches) {
    const url = match[2];
    if (url.startsWith("http") && !dependencies.includes(url)) {
      dependencies.push(url);
    }
  }

  return { path: filePath, exports, dependencies, content };
}
