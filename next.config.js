const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
let build = process.env.VERCEL_GIT_COMMIT_SHA || 'unrecorded-local-build';
try { build = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(); } catch {}
const rules = createHash('sha256');
for (const file of ['config.ts','network.ts']) rules.update(readFileSync(`src/games/subway/${file}`));
/** @type {import('next').NextConfig} */
module.exports = {env: {NEXT_PUBLIC_SUBWAY_RULES_HASH:rules.digest('hex'), NEXT_PUBLIC_SUBWAY_BUILD_ID:build}};
