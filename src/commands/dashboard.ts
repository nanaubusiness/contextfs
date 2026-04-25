import * as http from "http";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { scanFiles, parseFile } from "../parser/index.js";
import { createLLMSummarizer } from "../summarizer/index.js";

const PORT = 3456;
const execAsync = promisify(exec);

interface FileProgress {
  file: string;
  status: "pending" | "processing" | "done" | "error";
  rawTokens?: number;
  summaryTokens?: number;
  savings?: number;
  summary?: string;
  rawContent?: string;
  startTime?: number;
  endTime?: number;
  error?: string;
}

interface DashboardState {
  files: FileProgress[];
  totalRawTokens: number;
  totalSummaryTokens: number;
  completed: number;
  failed: number;
  started: boolean;
  finished: boolean;
  startTime?: number;
}

const state: DashboardState = {
  files: [],
  totalRawTokens: 0,
  totalSummaryTokens: 0,
  completed: 0,
  failed: 0,
  started: false,
  finished: false,
};

async function killPort(port: number): Promise<void> {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`).catch(() => ({ stdout: '' }));
    if (stdout.trim()) {
      const pids = stdout.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        try { await execAsync(`kill -9 ${pid}`).catch(() => {}); } catch {}
      }
    }
  } catch {}
  await new Promise(r => setTimeout(r, 500));
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

function renderHTML(): string {
  const totalSavings = state.totalRawTokens > 0
    ? ((state.totalRawTokens - state.totalSummaryTokens) / state.totalRawTokens * 100)
    : 0;
  const elapsed = state.startTime ? ((Date.now() - state.startTime) / 1000) : 0;
  const progress = state.files.length > 0 ? ((state.completed + state.failed) / state.files.length * 100) : 0;

  const currentFile = state.files.find(f => f.status === "processing");
  const latestDone = state.files.filter(f => f.status === "done").slice(-1)[0];
  const displayFile = currentFile || latestDone;

  // Calculate preview content
  const rawPreview = displayFile?.rawContent
    ? truncate(displayFile.rawContent, 400)
    : '// Select a file to see its raw content';
  const summaryPreview = displayFile?.summary || '# Summary will appear here';

  // Build file grid items
  const fileGridItems = state.files.slice(0, 20).map(f => {
    const icon = f.status === 'done' ? '✓' : f.status === 'processing' ? '◐' : f.status === 'error' ? '✗' : '○';
    const savings = f.savings ? `${f.savings.toFixed(0)}%` : '--';
    const filename = f.file.split('/').pop() || f.file;
    const dir = f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : '';
    const bgClass = f.status === 'done' ? 'done' : f.status === 'processing' ? 'proc' : 'pend';
    return `<div class="fi ${bgClass}">
      <span class="fic">${icon}</span>
      <div class="fin">
        <div class="fname">${escapeHtml(filename)}</div>
        ${dir ? `<div class="fdir">${escapeHtml(dir)}</div>` : ''}
      </div>
      <span class="fsav ${f.status === 'done' ? 'green' : ''}">${savings}</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>ContextFS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0.5">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: #0d0d12;
      color: #fff;
    }

    html {
      scroll-behavior: smooth;
      overflow-y: scroll;
    }

    * { box-sizing: border-box; }

    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .page-wrapper {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .container {
      flex: 1;
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 40px;
      width: 100%;
    }

    /* Header */
    header {
      padding: 32px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .header-inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .logo-text {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .logo-text span {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.05);
      border-radius: 100px;
      font-size: 14px;
      font-weight: 500;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Hero */
    .hero {
      padding: 60px 0 40px;
      text-align: center;
    }

    .hero h1 {
      font-size: 72px;
      font-weight: 700;
      letter-spacing: -3px;
      line-height: 1;
      margin-bottom: 16px;
    }

    .hero h1 span {
      background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      font-size: 20px;
      color: #888;
      margin-bottom: 40px;
    }

    /* Stats */
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 48px;
    }

    .stat {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      padding: 24px;
      text-align: center;
    }

    .stat-value {
      font-size: 40px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .stat-value.purple { color: #a855f7; }
    .stat-value.green { color: #22c55e; }
    .stat-value.blue { color: #3b82f6; }
    .stat-value.orange { color: #f59e0b; }

    .stat-label {
      font-size: 13px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Progress */
    .progress-section {
      margin-bottom: 48px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 14px;
      color: #888;
    }

    .progress-bar {
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    /* Comparison */
    .comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 48px;
    }

    .compare-card {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 20px;
      overflow: hidden;
    }

    .compare-header {
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .compare-title {
      font-size: 15px;
      font-weight: 600;
    }

    .compare-title.without { color: #ef4444; }
    .compare-title.with { color: #22c55e; }

    .compare-badge {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 100px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-raw {
      background: rgba(239,68,68,0.15);
      color: #ef4444;
    }

    .badge-sum {
      background: rgba(34,197,94,0.15);
      color: #22c55e;
    }

    .compare-filename {
      padding: 12px 24px;
      font-size: 12px;
      color: #555;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-family: 'DM Mono', monospace;
    }

    .compare-filename span {
      color: #6366f1;
    }

    .compare-content {
      padding: 24px;
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      line-height: 1.7;
      color: #888;
      min-height: 180px;
      max-height: 180px;
      overflow: hidden;
      white-space: pre-wrap;
    }

    /* File Grid */
    .file-section {
      margin-bottom: 60px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .file-count {
      font-size: 13px;
      color: #666;
      font-weight: 400;
    }

    .file-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 8px;
    }

    .fi {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 18px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.04);
      border-radius: 12px;
      transition: all 0.15s;
    }

    .fi:hover {
      background: rgba(255,255,255,0.04);
    }

    .fi.done { border-color: rgba(34,197,94,0.2); }
    .fi.proc { border-color: rgba(99,102,241,0.3); }
    .fi.pend { opacity: 0.5; }

    .fic {
      font-size: 16px;
      width: 24px;
      text-align: center;
    }

    .fi.done .fic { color: #22c55e; }
    .fi.proc .fic { color: #6366f1; }

    .fin {
      flex: 1;
      min-width: 0;
    }

    .fname {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .fdir {
      font-size: 11px;
      color: #555;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .fsav {
      font-size: 13px;
      font-weight: 600;
      color: #666;
    }

    .fsav.green { color: #22c55e; }

    /* How it works */
    .how {
      text-align: center;
      padding: 60px 0;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .how h2 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 48px;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 40px;
    }

    .step {
      text-align: center;
    }

    .step-num {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
      margin: 0 auto 20px;
    }

    .step h3 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .step p {
      font-size: 14px;
      color: #666;
    }

    /* Footer */
    footer {
      text-align: center;
      padding: 40px 0;
      border-top: 1px solid rgba(255,255,255,0.06);
      color: #555;
      font-size: 13px;
    }

    footer a {
      color: #6366f1;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="container">
      <header>
        <div class="header-inner">
          <div class="logo">
            <div class="logo-icon">⚡</div>
            <div class="logo-text">Context<span>FS</span></div>
          </div>
          <div class="status-badge">
            <div class="status-dot"></div>
            ${state.finished ? 'Complete' : state.started ? 'Processing' : 'Ready'}
          </div>
        </div>
      </header>

    <section class="hero">
      <h1><span>Less context.</span><br>Less tokens.</h1>
      <p>Real-time code summarization — see the savings in action</p>

      <div class="stats">
        <div class="stat">
          <div class="stat-value purple">${totalSavings.toFixed(0)}%</div>
          <div class="stat-label">Token Savings</div>
        </div>
        <div class="stat">
          <div class="stat-value green">${state.completed}/${state.files.length}</div>
          <div class="stat-label">Files Done</div>
        </div>
        <div class="stat">
          <div class="stat-value blue">${(state.totalRawTokens / 1000).toFixed(1)}k</div>
          <div class="stat-label">Raw Tokens</div>
        </div>
        <div class="stat">
          <div class="stat-value orange">${elapsed.toFixed(1)}s</div>
          <div class="stat-label">Time</div>
        </div>
      </div>
    </section>

    <section class="progress-section">
      <div class="progress-header">
        <span>Progress</span>
        <span>${state.completed} of ${state.files.length} files • ${progress.toFixed(0)}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
    </section>

    <section class="comparison">
      <div class="compare-card">
        <div class="compare-header">
          <span class="compare-title without">Without ContextFS</span>
          <span class="compare-badge badge-raw">Raw</span>
        </div>
        <div class="compare-filename">${displayFile ? `<span>${escapeHtml(displayFile.file)}</span>` : 'waiting...'}</div>
        <div class="compare-content">${escapeHtml(rawPreview)}</div>
      </div>
      <div class="compare-card">
        <div class="compare-header">
          <span class="compare-title with">With ContextFS</span>
          <span class="compare-badge badge-sum">Summary</span>
        </div>
        <div class="compare-filename">${displayFile ? `<span>${escapeHtml(displayFile.file)}</span>` : 'waiting...'}</div>
        <div class="compare-content">${escapeHtml(summaryPreview)}</div>
      </div>
    </section>

    <section class="file-section">
      <h2 class="section-title">
        Files
        <span class="file-count">(${state.files.length} total)</span>
      </h2>
      <div class="file-grid">
        ${fileGridItems || '<div style="color:#555;padding:40px;text-align:center;">No files found in project</div>'}
      </div>
    </section>

    <section class="how">
      <h2>How it works</h2>
      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <h3>Scan</h3>
          <p> Finds all code files in your project</p>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <h3>Summarize</h3>
          <p>Transforms each file into minimal summary</p>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <h3>Save</h3>
          <p>AI reads summaries instead of raw files</p>
        </div>
      </div>
    </section>
    </div>

    <footer>
      <p>Run <code>contextfs dashboard --root ./your-project</code> to analyze your codebase</p>
    </footer>
  </div>
</body>
</html>`;
}

async function getClaudeCodeToken(): Promise<string | undefined> {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    return settings.env?.ANTHROPIC_AUTH_TOKEN || undefined;
  } catch {
    return undefined;
  }
}

async function processFiles(projectPath: string): Promise<void> {
  // Check for API key - prefer explicit env var, then Claude Code's settings
  let apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Try to get token from Claude Code's settings
    apiKey = await getClaudeCodeToken();
    if (apiKey) {
      console.log('[contextfs] Using Claude Code subscription');
    }
  }

  if (!apiKey) {
    console.error('[contextfs] No API key found. Set ANTHROPIC_API_KEY or run Claude Code first.');
    process.exit(1);
  }

  const summarizer = await createLLMSummarizer(apiKey);
  console.log(`[contextfs] Summarizing with MiniMax API`);

  const files = await scanFiles(projectPath);

  state.files = files.map(f => ({
    file: path.relative(projectPath, f),
    status: "pending",
  }));
  state.started = true;
  state.startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    state.files[i].status = "processing";
    state.files[i].startTime = Date.now();

    try {
      const content = await fs.readFile(file, "utf-8");
      const parsed = await parseFile(file);
      const rawTokens = Math.ceil(content.length / 4);

      state.files[i].rawContent = content;
      state.files[i].rawTokens = rawTokens;

      const summary = await summarizer.summarize(parsed);
      const summaryTokens = Math.ceil(summary.length / 4);
      const savings = ((rawTokens - summaryTokens) / rawTokens * 100);

      state.files[i] = {
        ...state.files[i],
        status: "done",
        rawTokens,
        summaryTokens,
        savings,
        summary,
        endTime: Date.now(),
      };

      state.totalRawTokens += rawTokens;
      state.totalSummaryTokens += summaryTokens;
      state.completed++;
    } catch (error: any) {
      state.files[i] = {
        ...state.files[i],
        status: "error",
        error: error.message,
        endTime: Date.now(),
      };
      state.failed++;
    }
  }

  state.finished = true;
}

export async function runDashboard(projectPath: string): Promise<void> {
  await killPort(PORT);
  processFiles(projectPath).catch(console.error);

  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderHTML());
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                   ContextFS Live Dashboard                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   🌐 Open in your browser:                                                 ║
║      http://localhost:${PORT}                                                  ║
║      http://127.0.0.1:${PORT}                                                 ║
║                                                                              ║
║   Project: ${projectPath.padEnd(52)}║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
  });
}
