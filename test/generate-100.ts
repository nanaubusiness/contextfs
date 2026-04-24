#!/usr/bin/env node

/**
 * Generate 100 mock files of varying sizes for testing
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// File type templates
const templates = {
  service: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, {
      sm: { functions: 3, handlers: 2, exports: 5 },
      md: { functions: 8, handlers: 5, exports: 12 },
      lg: { functions: 15, handlers: 10, exports: 25 },
      xl: { functions: 30, handlers: 20, exports: 50 },
    });

    return `/**
 * ${name} - Service module
 * Auto-generated for testing
 */

${lines.imports}

${lines.interfaces}

${lines.functions}

${lines.exports}
`;
  },

  api: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, {
      sm: { endpoints: 3, handlers: 4, types: 3 },
      md: { endpoints: 8, handlers: 10, types: 8 },
      lg: { endpoints: 15, handlers: 20, types: 15 },
      xl: { endpoints: 30, handlers: 40, types: 30 },
    });

    return `/**
 * ${name} - API module
 * Auto-generated for testing
 */

${lines.imports}

${lines.interfaces}

${lines.handlers}

${lines.exports}
`;
  },

  model: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, {
      sm: { fields: 5, methods: 3, relations: 2 },
      md: { fields: 12, methods: 8, relations: 5 },
      lg: { fields: 25, methods: 15, relations: 10 },
      xl: { fields: 50, methods: 30, relations: 20 },
    });

    return `/**
 * ${name} - Model module
 * Auto-generated for testing
 */

${lines.imports}

${lines.interfaces}

${lines.class}

${lines.exports}
`;
  },

  utils: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, {
      sm: { functions: 5, helpers: 3 },
      md: { functions: 12, helpers: 8 },
      lg: { functions: 25, helpers: 15 },
      xl: { functions: 50, helpers: 30 },
    });

    return `/**
 * ${name} - Utility module
 * Auto-generated for testing
 */

${lines.imports}

${lines.interfaces}

${lines.functions}

${lines.exports}
`;
  },
};

interface GenConfig {
  functions?: number;
  handlers?: number;
  exports?: number;
  endpoints?: number;
  types?: number;
  fields?: number;
  methods?: number;
  relations?: number;
  helpers?: number;
}

function generateLines(size: "sm" | "md" | "lg" | "xl", config: GenConfig) {
  const multipliers = { sm: 1, md: 2, lg: 4, xl: 8 };
  const m = multipliers[size];

  const imports = [
    `import { db } from "./database";`,
    `import { validate, sanitize } from "./utils";`,
    `import { EventEmitter } from "events";`,
    `import * as crypto from "crypto";`,
    `import { CACHE_TTL, API_BASE } from "../config";`,
  ].slice(0, 2 + m).join("\n");

  const interfaces = `
interface Config {
  id: string;
  name: string;
  value: number;
  metadata: Record<string, unknown>;
}

interface Result {
  success: boolean;
  data?: unknown;
  error?: string;
}
`.slice(0, 50 + m * 20);

  const functions = Array.from({ length: config.functions || 5 }, (_, i) => `
export async function process${i}(input: Config): Promise<Result> {
  const validated = validate(input);
  if (!validated) return { success: false, error: "Invalid input" };

  try {
    const data = await db.query(validated);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
`).join("\n");

  const handlers = Array.from({ length: config.handlers || 5 }, (_, i) => `
export async function handle${i}(req: Request): Promise<Response> {
  const body = await req.json();
  const sanitized = sanitize(body);

  const result = await process${i}(sanitized);
  return Response.json(result);
}
`).join("\n");

  const exports = Array.from({ length: config.exports || 5 }, (_, i) => {
    const items = ["process" + i, "handle" + i, "validate" + i, "Config" + i, "Result" + i];
    return `export { ${items.slice(0, 3).join(", ")} };`;
  }).join("\n");

  const endpoints = Array.from({ length: config.endpoints || 5 }, (_, i) => `
  ${["GET", "POST", "PUT", "DELETE"][i % 4]} /api/${i === 0 ? "items" : `items/${i}`}: handle${i},
`).join("");

  const types = Array.from({ length: config.types || 5 }, (_, i) => `
export interface Item${i} {
  id: string;
  name: string;
  count: number;
  tags: string[];
}
`).join("\n");

  const class_ = `
export class Model {
  constructor(private config: Config) {}

  ${Array.from({ length: config.methods || 3 }, (_, i) => `
  async method${i}(): Promise<void> {
    await db.connect();
    await db.query(this.config);
  }
  `).join("\n")}

  ${Array.from({ length: config.relations || 2 }, (_, i) => `
  get relation${i}(): RelatedModel {
    return new RelatedModel(this.config.id);
  }
  `).join("\n")}
}
`.slice(0, 100 + m * 50);

  const helpers = Array.from({ length: config.helpers || 5 }, (_, i) => `
export function helper${i}(value: string): string {
  return value.trim().toLowerCase();
}
`).join("\n");

  return { imports, interfaces, functions, handlers, exports, endpoints, types, class: class_, helpers };
}

const sizes: ("sm" | "md" | "lg" | "xl")[] = ["sm", "md", "lg", "xl"];
const typeNames = Object.keys(templates) as (keyof typeof templates)[];
const outputDir = path.join(__dirname, "mock-project100");

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Generating 100 mock files in ${outputDir}...`);

  for (let i = 0; i < 100; i++) {
    const type = typeNames[i % typeNames.length];
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    const name = `${type}-${String(i).padStart(3, "0")}`;
    const content = templates[type](name, size);

    const filePath = path.join(outputDir, `${name}.ts`);
    await fs.writeFile(filePath, content);

    if ((i + 1) % 20 === 0) {
      console.log(`  Generated ${i + 1}/100 files...`);
    }
  }

  console.log("Done!");
}

main().catch(console.error);
