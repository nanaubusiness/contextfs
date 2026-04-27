import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { spawn, ChildProcess } from "child_process";
import * as proc from "process";

type Editor = "claude-code" | "cursor" | "codex" | "vscode";

// ── Launcher plist/daemon files ─────────────────────────────────────────────────

const LAUNCHD_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.contextfs.watcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{WATCHER_SCRIPT}}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/contextfs-watcher.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/contextfs-watcher.err</string>
</dict>
</plist>
`;

async function writeLauncherDaemon(projectDirs: string[], editor: Editor): Promise<void> {
  const home = os.homedir();
  const installDir = path.join(home, ".local", "contextfs");

  // Write a shell script that the daemon runs
  const watcherScriptPath = path.join(installDir, "watcher.sh");
  const watcherScript = buildWatcherScript(projectDirs);
  await fs.writeFile(watcherScriptPath, watcherScript, "utf-8");
  await fs.chmod(watcherScriptPath, 0o755);

  if (proc.platform === "darwin") {
    // macOS: launchd
    const plistPath = path.join(home, "Library", "LaunchAgents", "com.contextfs.watcher.plist");
    const plistContent = LAUNCHD_PLIST.replace("{{WATCHER_SCRIPT}}", watcherScriptPath);
    await fs.mkdir(path.dirname(plistPath), { recursive: true });
    await fs.writeFile(plistPath, plistContent, "utf-8");
    await fs.chmod(plistPath, 0o644);

    // Load the daemon
    spawn("launchctl", ["load", plistPath], { detached: true, stdio: "ignore" });
    console.log("  Watcher daemon started (launchd)");
  } else {
    // Linux: systemd user service
    const systemdDir = path.join(home, ".config", "systemd", "user");
    await fs.mkdir(systemdDir, { recursive: true });
    const serviceContent = `[Unit]
Description=ContextFS File Watcher

[Service]
Type=simple
ExecStart=${watcherScriptPath}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;
    const servicePath = path.join(systemdDir, "contextfs-watcher.service");
    await fs.writeFile(servicePath, serviceContent, "utf-8");
    spawn("systemctl", ["--user", "daemon-reload"], { detached: true, stdio: "ignore" });
    spawn("systemctl", ["--user", "enable", "--now", "contextfs-watcher"], { detached: true, stdio: "ignore" });
    console.log("  Watcher daemon started (systemd)");
  }
}

function buildWatcherScript(projectDirs: string[]): string {
  const dirsArg = projectDirs.map(d => `"${d}"`).join(" ");
  const isMac = proc.platform === "darwin";
  const watcherCmd = isMac ? "fswatch" : "inotifywait";

  if (isMac) {
    // fswatch: recursive, exclude summary/git/node_modules, print paths
    return `#!/bin/bash
WATCH_DIRS=(${dirsArg})
EXCLUDE_PATTERN="--exclude=\\.(summary|git|node_modules|DS_Store)$"

for dir in "\${WATCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        fswatch -r $EXCLUDE_PATTERN --format="%path" "$dir" | while read -r file; do
            # Only process source files
            case "$file" in
                *.ts|*.tsx|*.js|*.jsx|*.py)
                    dir=$(dirname "$file")
                    contextfs build --root "$dir" --target "$file" &
                    ;;
            esac
        done &
    fi
done
wait
`;
  } else {
    // Linux: inotifywait
    return `#!/bin/bash
WATCH_DIRS=(${dirsArg})
for dir in "\${WATCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        inotifywait -rm -e modify,create -e exclude="(\\.summary$|\\.git/|node_modules/)" "$dir" | while read -r _ _ file; do
            case "$file" in
                *.ts|*.tsx|*.js|*.jsx|*.py)
                    dir=$(dirname "$file")
                    contextfs build --root "$dir" --target "$file" &
                    ;;
            esac
        done &
    fi
done
wait
`;
  }
}

// ── Simple background process (fallback) ─────────────────────────────────────────

let watcherProcess: ChildProcess | null = null;

async function startWatcherProcess(projectDirs: string[]): Promise<void> {
  const isMac = proc.platform === "darwin";
  const watcherCmd = isMac ? "fswatch" : "inotifywait";

  // Check if watcher is available
  const possiblePaths = isMac
    ? ["/usr/local/bin/fswatch", "/opt/homebrew/bin/fswatch", "/usr/bin/fswatch"]
    : ["/usr/bin/inotifywait", "/usr/local/bin/inotifywait"];

  let available = false;
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      available = true;
      break;
    } catch { /* try next */ }
  }

  if (!available) {
    console.warn(`  Warning: ${watcherCmd} not found. Auto-update disabled.`);
    console.warn(`  Install with: ${isMac ? "brew install fswatch" : "sudo apt install inotify-tools"}`);
    return;
  }

  const excludeArg = isMac
    ? ["--exclude=.*\\.summary$", "--exclude=.*\\.git.*", "--exclude=.*node_modules.*"]
    : ["--exclude", ".*\\.summary$", "--exclude", ".*\\.git.*", "--exclude", ".*node_modules.*"];

  const args = [
    "-r",
    ...excludeArg,
    "--format=%path",
    ...projectDirs.filter(d => d.trim()),
  ];

  const watcherProc = spawn(watcherCmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let buffer = "";

  watcherProc.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const file of lines) {
      if (!file.trim()) continue;
      // Only process source files
      if (file.match(/\.(ts|tsx|js|jsx|py)$/)) {
        const dir = path.dirname(file);
        spawn("contextfs", ["build", "--root", dir, "--target", file], {
          detached: true,
          stdio: "ignore",
        });
      }
    }
  });

  watcherProc.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[contextfs watcher] ${chunk.toString().trim()}`);
  });

  watcherProc.on("close", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[contextfs watcher] exited with code ${code}`);
    }
  });

  // Unref so parent can exit
  watcherProc.unref();
  watcherProcess = watcherProc;
  console.log(`  Background watcher started (pid ${proc.pid})`);
}

// ── Main setup ─────────────────────────────────────────────────────────────────

export async function setupWatcher(
  projectDirs: string[],
  editor: Editor,
): Promise<void> {
  if (projectDirs.length === 0) return;

  console.log("  Setting up file watcher...");

  try {
    await writeLauncherDaemon(projectDirs, editor);
  } catch (err) {
    console.warn(`  Daemon setup failed, using background process: ${err}`);
    await startWatcherProcess(projectDirs);
  }
}

export function stopWatcher(): void {
  if (watcherProcess) {
    watcherProcess.kill();
    watcherProcess = null;
  }
}
