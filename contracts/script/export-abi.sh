#!/usr/bin/env bash
# Writes ABI JSON files for the frontend into ./abi
set -euo pipefail
cd "$(dirname "$0")/.."
forge build >/dev/null
for c in RuleRegistry Feed; do
  forge inspect "$c" abi --json > "abi/$c.json"
  echo "wrote abi/$c.json"
done
