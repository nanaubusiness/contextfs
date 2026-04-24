import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export async function runInit(): Promise<void> {
  const homeDir = os.homedir();
  const settingsPath = path.join(homeDir, ".claude", "settings.json");

  const hookCommand = `jq -r '.tool_input.file_path // empty' | { read -r f; [ -n "$f" ] && contextfs build --root . --target "$f"; } 2>/dev/null || true`;

  const hookEntry = {
    FileChanged: [{
      hooks: [{
        type: "command",
        command: hookCommand,
        async: true,
        statusMessage: "Updating ContextFS summary"
      }]
    }]
  };

  try {
    // Check if settings file exists
    let settings: any = {};
    if (await fs.access(settingsPath).then(() => true).catch(() => false)) {
      const content = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(content);
    }

    // Check if hooks already configured
    if (settings.hooks?.FileChanged) {
      const existing = settings.hooks.FileChanged[0]?.hooks?.[0]?.command || "";
      if (existing.includes("contextfs")) {
        console.log("ContextFS hook already configured in ~/.claude/settings.json");
        console.log("Done! ContextFS is ready to use.");
        return;
      }
    }

    // Add hooks
    if (!settings.hooks) settings.hooks = {};
    settings.hooks.FileChanged = hookEntry.FileChanged;

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    console.log("Added ContextFS hook to ~/.claude/settings.json");
    console.log("");
    console.log("ContextFS is now connected to Claude Code!");
    console.log("");
    console.log("Usage:");
    console.log("  contextfs build --root .       Build all summaries");
    console.log("  contextfs query \"auth\" --root .  Search summaries");
    console.log("");
    console.log("Every file save in Claude Code will now update that file's summary.");
    console.log("(You may need to restart Claude Code for changes to take effect.)");

  } catch (err: any) {
    if (err.code === "ENOENT") {
      // Claude Code not installed or no settings file
      console.log("Claude Code settings not found at ~/.claude/settings.json");
      console.log("");
      console.log("To use ContextFS with Claude Code:");
      console.log("1. Make sure Claude Code is installed");
      console.log("2. Add to ~/.claude/settings.json:");
      console.log(JSON.stringify({ hooks: hookEntry }, null, 2));
    } else {
      throw err;
    }
  }
}
