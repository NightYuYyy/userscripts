// Regenerates the script table in README.md from every */*.user.js header.
// Usage: node scripts/gen-readme.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_RAW = 'https://raw.githubusercontent.com/NightYuYyy/userscripts/main';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const meta = (src) => {
  const block = src.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/)?.[1] ?? '';
  const m = {};
  for (const line of block.split('\n')) {
    const r = line.match(/^\/\/\s*@(\S+)\s+(.*?)\s*$/);
    if (r && !(r[1] in m)) m[r[1]] = r[2];
  }
  return m;
};

const esc = (s) => String(s).replace(/[[\]|]/g, '\\$&').replace(/\s+/g, ' ');
const rows = [];
for (const dir of readdirSync(root).sort()) {
  const p = join(root, dir);
  if (dir.startsWith('.') || dir === 'scripts' || !statSync(p).isDirectory()) continue;
  for (const f of readdirSync(p).filter((f) => f.endsWith('.user.js'))) {
    const m = meta(readFileSync(join(p, f), 'utf8'));
    rows.push(`| [${esc(m.name ?? f)}](${dir}/) | ${m.version ?? '-'} | \`${m.match ?? '-'}\` | ${esc(m.description ?? '')} | [安装](${REPO_RAW}/${dir}/${f}) |`);
  }
}

const table = ['| 脚本 | 版本 | 匹配 | 说明 | 安装 |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');

const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
if (!readme.includes('<!-- scripts:start -->')) throw new Error('README.md missing <!-- scripts:start --> marker');
writeFileSync(
  readmePath,
  readme.replace(/<!-- scripts:start -->[\s\S]*?<!-- scripts:end -->/, `<!-- scripts:start -->\n${table}\n<!-- scripts:end -->`),
);
console.log(`README.md updated: ${rows.length} script(s)`);
