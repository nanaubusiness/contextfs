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

# ── Find all Claude Code projects and set up ContextFS in each ─────────────────
echo "Scanning for Claude Code projects..."
echo ""

FOUND=0
SETUP=0

# Find all directories containing a CLAUDE.md file
while IFS= read -r project_dir; do
    project_dir="${project_dir%/*}"  # remove the /CLAUDE.md part
    FOUND=$((FOUND + 1))

    # Skip the install dir itself
    if [ "$(realpath "$project_dir")" = "$(realpath "$INSTALL_DIR")" ]; then
        continue
    fi

    echo "[$FOUND] Found: $project_dir"

    cd "$project_dir"

    # Set up hook (idempotent — safe to run multiple times)
    if grep -q "contextfs" "${HOME}/.claude/settings.json" 2>/dev/null; then
        echo "    Hook already configured"
    else
        contextfs init --hook-only 2>/dev/null && echo "    Hook installed" || true
    fi

    # Set up CLAUDE.md rules
    if [ -f "CLAUDE.md" ] && grep -q "## ContextFS" "CLAUDE.md" 2>/dev/null; then
        echo "    CLAUDE.md already has ContextFS rules"
    else
        contextfs init --claude-md-only 2>/dev/null && echo "    CLAUDE.md updated" || true
    fi

    SETUP=$((SETUP + 1))
    echo ""

done < <(find "$HOME" -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null)

if [ "$FOUND" -eq 0 ]; then
    echo "No Claude Code projects found."
    echo ""
    echo "Go to your project directory and run:"
    echo "  contextfs init"
else
    echo "Set up ContextFS in $SETUP Claude Code project(s)."
fi

echo ""
echo "Done!"
echo ""
echo "  /contextfs build        Summarize your codebase"
echo "  /contextfs query <text> Find files by topic"
