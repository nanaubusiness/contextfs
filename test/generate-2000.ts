#!/usr/bin/env node

/**
 * Generate 2000 mock files for stress testing
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const templates = {
  service: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, { functions: 5, handlers: 3, exports: 8 });
    return `/**
 * ${name} - Service module
 */
${lines.imports}
${lines.interfaces}
${lines.functions}
${lines.exports}
`;
  },
  api: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, { endpoints: 5, handlers: 5, types: 5 });
    return `/**
 * ${name} - API module
 */
${lines.imports}
${lines.interfaces}
${lines.handlers}
${lines.exports}
`;
  },
  model: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, { fields: 8, methods: 5, relations: 3 });
    return `/**
 * ${name} - Model module
 */
${lines.imports}
${lines.interfaces}
${lines.class}
${lines.exports}
`;
  },
  utils: (name: string, size: "sm" | "md" | "lg" | "xl") => {
    const lines = generateLines(size, { functions: 8, helpers: 5 });
    return `/**
 * ${name} - Utility module
 */
${lines.imports}
${lines.interfaces}
${lines.functions}
${lines.exports}
`;
  },
};

function generateLines(size: "sm" | "md" | "lg" | "xl", config: any) {
  const multipliers = { sm: 1, md: 2, lg: 4, xl: 8 };
  const m = multipliers[size];

  const imports = [`import { db } from "./database";`, `import { validate } from "./utils";`].join("\n");

  const interfaces = `
interface Config {
  id: string;
  name: string;
  value: number;
}
`.slice(0, 100 + m * 30);

  const functions = Array.from({ length: config.functions }, (_, i) => `
export async function process${i}(input: Config): Promise<Result> {
  const validated = validate(input);
  if (!validated) return { success: false };
  return { success: true, data: await db.query(validated) };
}
`).join("\n");

  const handlers = Array.from({ length: config.handlers }, (_, i) => `
export async function handle${i}(req: Request): Promise<Response> {
  const body = await req.json();
  return Response.json(await process${i}(body));
}
`).join("\n");

  const exports = Array.from({ length: config.exports }, (_, i) => `export { process${i}, handle${i} };`).join("\n");

  const class_ = `
export class Model {
  ${Array.from({ length: config.methods }, (_, i) => `
  async method${i}() { return await db.connect(); }
  `).join("\n")}
}
`.slice(0, 100 + m * 40);

  const helpers = Array.from({ length: config.helpers }, (_, i) => `
export function helper${i}(value: string): string {
  return value.trim().toLowerCase();
}
`).join("\n");

  return { imports, interfaces, functions, handlers, exports, class: class_, helpers };
}

const sizes: ("sm" | "md" | "lg" | "xl")[] = ["sm", "md", "lg", "xl"];
const typeNames = Object.keys(templates);
const outputDir = path.join(__dirname, "mock-project2000");

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Generating 2000 mock files in ${outputDir}...`);

  for (let i = 0; i < 2000; i++) {
    const type = typeNames[i % typeNames.length];
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    const name = `${type}-${String(i).padStart(4, "0")}`;
    const content = templates[type as keyof typeof templates](name, size);

    const filePath = path.join(outputDir, `${name}.ts`);
    await fs.writeFile(filePath, content);

    if ((i + 1) % 200 === 0) {
      console.log(`  Generated ${i + 1}/2000 files...`);
    }
  }

  console.log("Done!");
}

main().catch(console.error);
