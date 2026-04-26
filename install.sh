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

# ── Extract pre-built dist (committed as contextfs.tar.gz) ─────────────────────
if [ ! -f "dist/index.js" ]; then
    if [ -f "contextfs.tar.gz" ]; then
        echo "Extracting pre-built files..."
        tar -xzf contextfs.tar.gz
    else
        echo "Error: dist/index.js not found and contextfs.tar.gz missing."
        exit 1
    fi
fi

# ── Install binary as shell wrapper (avoids shebang issues across platforms) ────
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

# ── Project setup ─────────────────────────────────────────────────────────────
if [ -d "$(pwd)/.git" ] || [ -f "$(pwd)/package.json" ] || [ -f "$(pwd)/CLAUDE.md" ]; then
    echo "Setting up Claude Code integration in $(pwd)..."
    contextfs init
else
    echo "Go to your project directory and run:"
    echo "  contextfs init"
fi

echo ""
echo "Done!"
echo ""
echo "  /contextfs build        Summarize your codebase"
echo "  /contextfs query <text> Find files by topic"
