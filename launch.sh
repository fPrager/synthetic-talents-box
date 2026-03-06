#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"

cd "$APP_DIR"

echo ">>> Installing dependencies..."
npm install

echo ">>> Starting app (tunnel will print public URL)..."
node server.js
