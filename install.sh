#!/bin/bash
set -e

echo "Installing ContextFS..."

REPO_URL="https://github.com/nanaubusiness/contextfs.git"
INSTALL_DIR="${HOME}/.local/contextfs"
BIN_DIR="${HOME}/.local/bin"

mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# ── Pre-built tarball (fastest path) ──────────────────────────────────────────
if [ -f "${HOME}/.local/contextfs/contextfs.tar.gz" ]; then
    echo "Using pre-built package..."
    tar -xzf "${HOME}/.local/contextfs/contextfs.tar.gz" -C "$INSTALL_DIR" --strip-components=1 2>/dev/null || {
        echo "Extracting pre-built package..."
        tar -xzf "${HOME}/.local/contextfs/contextfs.tar.gz" -C "$INSTALL_DIR"
    }

# ── Git clone + build ─────────────────────────────────────────────────────────
else
    if [ -d "${INSTALL_DIR}/.git" ]; then
        echo "Updating existing ContextFS..."
        cd "$INSTALL_DIR"
        git pull origin main
    else
        echo "Cloning ContextFS..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    if command -v npm &> /dev/null; then
        echo "Building ContextFS..."
        npm install
        npm run build
    else
        echo "Error: npm is required to build from source. Install Node.js 18+ first."
        echo "Or download a pre-built release from: https://github.com/nanaubusiness/contextfs/releases"
        exit 1
    fi
fi

# ── Install binary ─────────────────────────────────────────────────────────────
cp "${INSTALL_DIR}/dist/index.js" "${BIN_DIR}/contextfs"
chmod +x "${BIN_DIR}/contextfs"

# ── Install Claude Code skill ─────────────────────────────────────────────────
SKILL_DIR="${HOME}/.claude/skills/contextfs"
mkdir -p "$SKILL_DIR"
if [ -f "${INSTALL_DIR}/.claude/skills/contextfs/SKILL.md" ]; then
    cp "${INSTALL_DIR}/.claude/skills/contextfs/SKILL.md" "$SKILL_DIR/SKILL.md"
elif [ -f "${INSTALL_DIR}/SKILL.md" ]; then
    cp "${INSTALL_DIR}/SKILL.md" "$SKILL_DIR/SKILL.md"
fi

echo ""
echo "ContextFS installed to ~/.local/bin/contextfs"

# ── Claude Code hook setup ─────────────────────────────────────────────────────
if [ -d "$(pwd)/.git" ] || [ -f "$(pwd)/package.json" ] || [ -f "$(pwd)/CLAUDE.md" ]; then
    echo ""
    echo "Setting up Claude Code integration in $(pwd)..."
    contextfs init
else
    echo ""
    echo "Next, go to your project directory and run:"
    echo "  contextfs init"
    echo ""
    echo "This sets up the Claude Code hook and CLAUDE.md rules in your project."
fi

echo ""
echo "Done!"
echo ""
echo "  /contextfs build        Summarize your codebase"
echo "  /contextfs query <text> Find files by topic"
