#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d /tmp/bearings-check.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT
cat >"$test_dir/tsconfig.json" <<EOF
{
  "extends": "$repo_root/tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "$test_dir/out",
    "rootDir": "$repo_root",
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "es2022",
    "jsx": "react-jsx",
    "incremental": false,
    "typeRoots": ["$repo_root/node_modules/@types"]
  },
  "include": ["$repo_root/scripts/bearings-test.tsx", "$repo_root/scripts/bearings-api-test.ts"]
}
EOF
cd "$repo_root"
./node_modules/.bin/tsc -p "$test_dir/tsconfig.json"
mkdir -p "$test_dir/out/node_modules/@"
ln -s "$test_dir/out/src/engine" "$test_dir/out/node_modules/@/engine"
ln -s "$test_dir/out/src/games" "$test_dir/out/node_modules/@/games"
ln -s "$test_dir/out/src/lib" "$test_dir/out/node_modules/@/lib"
NODE_PATH="$repo_root/node_modules" node "$test_dir/out/scripts/bearings-test.js"
TURSO_DATABASE_URL="file:$test_dir/rooms.db" TURSO_AUTH_TOKEN="local-qa" NODE_PATH="$repo_root/node_modules" node "$test_dir/out/scripts/bearings-api-test.js"
