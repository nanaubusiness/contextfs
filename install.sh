#!/bin/bash
set -e

echo "Installing ContextFS..."

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

echo ""
echo "Configuring Claude Code hook..."
contextfs init

echo ""
echo "ContextFS installed!"
echo ""
echo "Next steps:"
echo "  contextfs build --root .      Build summaries for your project"
echo "  contextfs query \"auth\" --root .  Search your codebase"
