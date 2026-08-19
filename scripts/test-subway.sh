#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="/tmp/subway-test"
config="/tmp/subway-tsconfig.json"

rm -rf "$out_dir"
cat >"$config" <<EOF
{
  "extends": "$repo_root/tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "$out_dir",
    "rootDir": "$repo_root",
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "es2022",
    "incremental": false,
    "typeRoots": ["$repo_root/node_modules/@types"]
  },
  "include": [
    "$repo_root/scripts/subway-rules-test.ts",
    "$repo_root/src/games/subway/config.ts",
    "$repo_root/src/engine/**/*.ts"
  ]
}
EOF

cd "$repo_root"
npx tsc -p "$config"
mkdir -p "$out_dir/node_modules/@"
ln -s "$out_dir/src/engine" "$out_dir/node_modules/@/engine"
node "$out_dir/scripts/subway-rules-test.js"
