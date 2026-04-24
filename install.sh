#!/bin/bash
set -e

echo "Installing ContextFS..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/nanaubusiness/contextfs.git"

if ! command -v npm &> /dev/null; then
    echo "Error: npm is required but not installed."
    exit 1
fi

if [ -d "$HOME/contextfs" ]; then
    echo "Updating existing ContextFS..."
    cd "$HOME/contextfs"
    git pull origin main
else
    echo "Cloning ContextFS..."
    git clone "$REPO_URL" "$HOME/contextfs"
    cd "$HOME/contextfs"
fi

echo "Building ContextFS..."
npm install
npm run build

echo "Linking contextfs command..."
npm link

SETTINGS_FILE="$HOME/.claude/settings.json"
HOOKS_JSON='[{"hooks":[{"type":"command","command":"jq -r '\\''.tool_input.file_path // empty'\\'' | { read -r f; [ -n \"\$f\" ] && contextfs build --root . --mock --target \"\$f\"; } 2>/dev/null || true","async":true,"statusMessage":"Updating ContextFS summary"}]}]'

echo "Configuring Claude hooks..."

if [ -f "$SETTINGS_FILE" ]; then
    if grep -q '"hooks"' "$SETTINGS_FILE"; then
        echo "Hooks already exist in $SETTINGS_FILE. Skipping."
    else
        cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
        node -e "
const fs=require('fs');
const s=JSON.parse(fs.readFileSync('$SETTINGS_FILE','utf8'));
if(!s.hooks)s.hooks={};
s.hooks.FileChanged=$HOOKS_JSON;
fs.writeFileSync('$SETTINGS_FILE',JSON.stringify(s,null,2));
"
        echo "Hooks added to $SETTINGS_FILE"
    fi
else
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    node -e "
const fs=require('fs');
const s={hooks:{FileChanged:$HOOKS_JSON}};
fs.writeFileSync('$SETTINGS_FILE',JSON.stringify(s,null,2));
"
    echo "Created $SETTINGS_FILE"
fi

echo ""
echo "ContextFS installed!"
echo "Usage: contextfs build --root ."
