import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const INSTALL_DIR = path.join(os.homedir(), ".local", "contextfs");
const BIN_DIR = path.join(os.homedir(), ".local", "bin");
const WRAPPER_PATH = path.join(BIN_DIR, "contextfs");
const SKILL_SRC = path.join(INSTALL_DIR, ".claude", "skills", "contextfs", "SKILL.md");
const SKILL_DEST = path.join(os.homedir(), ".claude", "skills", "contextfs", "SKILL.md");

export interface UpdateOptions {
  force?: boolean;
}

export async function runUpdate(options: UpdateOptions = {}): Promise<void> {
  const { force = false } = options;

  console.log("\n" + "═".repeat(60));
  console.log("  ContextFS Update");
  console.log("═".repeat(60));

  // ── Step 1: Detect install ──────────────────────────────────────────────
  try {
    await fs.access(WRAPPER_PATH);
    await fs.access(path.join(INSTALL_DIR, ".git"));
  } catch {
    console.error("\n❌ ContextFS is not installed.");
    console.error("\nTo install, run:");
    console.error("  curl -fsSL https://raw.githubusercontent.com/nanaubusiness/contextfs/main/install.sh | sh");
    return;
  }

  // ── Step 2: Get current version ────────────────────────────────────────
  let beforeHash: string;
  try {
    beforeHash = execSync("git rev-parse HEAD", { cwd: INSTALL_DIR, encoding: "utf-8" }).trim();
  } catch {
    console.error("\n❌ Could not determine current version.");
    return;
  }

  console.log(`\n  Current version: ${beforeHash.slice(0, 8)}`);

  // ── Step 3: Fetch latest from GitHub ───────────────────────────────────
  console.log("\n  Fetching latest from GitHub...");
  try {
    execSync("git fetch origin main", { cwd: INSTALL_DIR, stdio: "pipe" });
  } catch {
    console.error("\n❌ Failed to fetch from GitHub. Check your internet connection.");
    return;
  }

  let afterHash: string;
  try {
    afterHash = execSync("git rev-parse origin/main", { cwd: INSTALL_DIR, encoding: "utf-8" }).trim();
  } catch {
    console.error("\n❌ Could not determine remote version.");
    return;
  }

  console.log(`  Latest version:  ${afterHash.slice(0, 8)}`);

  // ── Step 4: Check if update needed ─────────────────────────────────────
  if (beforeHash === afterHash && !force) {
    console.log("\n✅ Already on the latest version.");
    return;
  }

  if (force) {
    console.log("\n  Force update — rebuilding regardless of version.");
  }

  // ── Step 5: Pull latest code ───────────────────────────────────────────
  if (beforeHash !== afterHash) {
    console.log("\n  Updating source files...");
    try {
      execSync("git reset --hard origin/main", { cwd: INSTALL_DIR, stdio: "pipe" });
    } catch {
      console.error("\n❌ Failed to update source files.");
      return;
    }
  }

  // ── Step 6: Rebuild if needed ──────────────────────────────────────────
  const distPath = path.join(INSTALL_DIR, "dist", "index.js");
  let needsBuild = force || !(await fileExists(distPath));

  if (needsBuild) {
    console.log("\n  Building...");
    try {
      execSync("npm install", { cwd: INSTALL_DIR, stdio: "inherit" });
      execSync("npm run build", { cwd: INSTALL_DIR, stdio: "inherit" });
    } catch {
      console.error("\n❌ Build failed. Try manually:");
      console.error("  cd ~/.local/contextfs && npm install && npm run build");
      return;
    }
  } else {
    console.log("\n  dist/index.js present — skipping build.");
  }

  // ── Step 7: Update shell wrapper ───────────────────────────────────────
  console.log("\n  Updating shell wrapper...");
  const wrapperContent = `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)/../contextfs"
exec node "$DIR/dist/index.js" "$@"
`;
  try {
    await fs.writeFile(WRAPPER_PATH, wrapperContent, "utf-8");
    await fs.chmod(WRAPPER_PATH, 0o755);
  } catch (err) {
    console.error("\n❌ Failed to update shell wrapper:", err);
    return;
  }

  // ── Step 8: Update skill file ───────────────────────────────────────────
  if (await fileExists(SKILL_SRC)) {
    console.log("  Updating Claude Code skill...");
    try {
      const skillDir = path.dirname(SKILL_DEST);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.copyFile(SKILL_SRC, SKILL_DEST);
    } catch (err) {
      console.warn("  ⚠ Could not update skill file:", err);
    }
  }

  // ── Done ───────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  if (beforeHash !== afterHash) {
    console.log(`  ✅ Updated: ${beforeHash.slice(0, 8)} → ${afterHash.slice(0, 8)}`);
  } else if (force) {
    console.log(`  ✅ Force rebuild complete`);
  } else {
    console.log(`  ✅ Already on the latest version`);
  }
  console.log("═".repeat(60) + "\n");
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
