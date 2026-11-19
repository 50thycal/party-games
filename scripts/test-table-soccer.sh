#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d /tmp/table-soccer-check.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT
cat >"$test_dir/tsconfig.json" <<CONFIG
{
  "extends": "$repo_root/tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "$test_dir/out",
    "rootDir": "$repo_root",
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "es2022",
    "incremental": false,
    "typeRoots": ["$repo_root/node_modules/@types"]
  },
  "include": ["$repo_root/scripts/table-soccer-test.ts"]
}
CONFIG
cd "$repo_root"
./node_modules/.bin/tsc -p "$test_dir/tsconfig.json"
node "$test_dir/out/scripts/table-soccer-test.js"
