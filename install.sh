#!/bin/bash
set -e

INSTALL_DIR="${HOME}/.local/contextfs"
BIN_DIR="${HOME}/.local/bin"
REPO_URL="https://github.com/nanaubusiness/contextfs.git"

mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# ── Clone or update ─────────────────────────────────────────────────────────────
if [ -d "${INSTALL_DIR}/.git" ]; then
    echo "Updating ContextFS..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo "Cloning ContextFS..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ── Extract pre-built dist (from tarball) or build from source ─────────────────
if [ ! -f "dist/index.js" ]; then
    if [ -f "contextfs.tar.gz" ]; then
        echo "Extracting pre-built files..."
        tar -xzf contextfs.tar.gz
    else
        echo "Building from source..."
        npm install
        npm run build
    fi
fi

# ── Install binary as shell wrapper ─────────────────────────────────────────────
WRAPPER="${BIN_DIR}/contextfs"
cat > "$WRAPPER" << 'WRAPPER_EOF'
#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)/../contextfs"
exec node "$DIR/dist/index.js" "$@"
WRAPPER_EOF
chmod +x "$WRAPPER"

# ── Install Claude Code skill ──────────────────────────────────────────────────
SKILL_DIR="${HOME}/.claude/skills/contextfs"
mkdir -p "$SKILL_DIR"
if [ -f "${INSTALL_DIR}/.claude/skills/contextfs/SKILL.md" ]; then
    cp "${INSTALL_DIR}/.claude/skills/contextfs/SKILL.md" "$SKILL_DIR/SKILL.md"
elif [ -f "${INSTALL_DIR}/SKILL.md" ]; then
    cp "${INSTALL_DIR}/SKILL.md" "$SKILL_DIR/SKILL.md"
fi

echo "ContextFS installed to ~/.local/bin/contextfs"
echo ""

# ── Run contextfs install (handles editor detection + project setup) ─────────────
echo "Setting up ContextFS for your editors and projects..."
echo ""

contextfs install || true

echo ""
echo "Done!"
echo ""
echo "  contextfs build            Summarize your codebase"
echo "  contextfs query <text>     Find files by topic"
echo "  contextfs context-files    Summarize context/*.md files"
echo ""
echo "Cross-session memory: PreCompact hook fires at ~98% context automatically."
echo "Editor integrations:"
echo "  Claude Code — MCP server + PreCompact/SessionStart hooks"
echo "  Cursor     — MCP server + auto-update on save"
echo "  Codex      — MCP server + auto-update on save"
echo "  VS Code    — MCP server + auto-update on save"
