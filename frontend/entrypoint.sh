#!/bin/sh
set -e

echo "Checking frontend dependencies..."
lock_hash=$(sha256sum package-lock.json | cut -d ' ' -f 1)
if [ ! -f node_modules/.package-lock.sha256 ] || [ "$(cat node_modules/.package-lock.sha256)" != "$lock_hash" ]; then
  npm ci --include=dev
  printf '%s\n' "$lock_hash" > node_modules/.package-lock.sha256
fi

npm run build
exec npm run start
