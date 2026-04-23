#!/usr/bin/env sh
set -e

REPO="nanaubusiness/contextfs"
TMP=$(mktemp -d)

# Get latest tag
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed 's/.*": "\([^"]*\)".*/\1/')

echo "Installing ContextFS $LATEST..."
TARBALL="contextfs.tar.gz"

curl -fsSL "https://github.com/$REPO/releases/download/$LATEST/$TARBALL" -o "$TMP/$TARBALL"

cd "$TMP"
tar -xzf "$TARBALL"
npm install -g

cd /
rm -rf "$TMP"

echo "Done! Run: contextfs build"
