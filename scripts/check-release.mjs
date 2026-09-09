import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.vercel/output/static');
const failures = [];
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(path, e.name)) : [resolve(path, e.name)]);
}
const sources = ['backend', 'frontend', 'css'].flatMap(p => walk(resolve(root, p))).concat(resolve(root, 'index.html'), resolve(root, 'manifest.webmanifest'));
for (const file of sources) {
  const copy = resolve(output, relative(root, file));
  if (!existsSync(copy) || !readFileSync(file).equals(readFileSync(copy))) failures.push(`配信コピー不一致: ${relative(root, file)}`);
}
for (const file of [...sources, ...walk(output), ...walk(resolve(root, 'worker'))]) {
  if (!/\.(js|mjs|cjs|html|css|json)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (/^(<{7}|={7}|>{7})(?:\s|$)/m.test(text)) failures.push(`競合マーカー: ${file}`);
  const scripts = file.endsWith('.html') ? [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/importmap|application\/json/.test(m[1])).map(m => m[2]) : /\.[cm]?js$/.test(file) ? [text] : [];
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: script, encoding: 'utf8' });
    if (result.status !== 0) failures.push(`構文エラー: ${file}\n${result.stderr}`);
    for (const match of script.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g)) {
      if (!existsSync(resolve(dirname(file), match[1]))) failures.push(`参照欠落: ${file} → ${match[1]}`);
    }
  }
}
if (failures.length) { console.error([...new Set(failures)].join('\n')); process.exit(1); }
console.log('PASS: 構文・競合マーカー・モジュール参照・静的配信コピー');
