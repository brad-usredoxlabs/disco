#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "AppShell line count:"
wc -l src/app/AppShell.vue

echo
echo "Running vitest suite..."
npm test

echo
echo "Running validation suite..."
npm run test:validate

echo
echo "Guardrails completed successfully."
