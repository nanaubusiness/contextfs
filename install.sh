#!/usr/bin/env sh
set -e

REPO="nanaubusiness/contextfs"
TMP=$(mktemp -d)

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
[ "$OS" = "darwin" ] && OS="macos"

ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH="x64"

ASSET="contextfs-${OS}-${ARCH}"

echo "Downloading ContextFS..."
curl -fsSL "https://github.com/$REPO/releases/latest/download/${ASSET}" -o "$TMP/contextfs" || {
  echo "Binary not found. Use: npm install -g contextfs"
  exit 1
}

chmod +x "$TMP/contextfs"
mv "$TMP/contextfs" /usr/local/bin/contextfs
rm -rf "$TMP"

echo "ContextFS installed! Run: contextfs build"
