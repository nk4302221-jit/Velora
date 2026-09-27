import { transform } from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const rel = (p) => (p.startsWith(root) ? p.slice(root.length + 1).replace(/\\/g, '/') : p);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'data', 'uploads'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(js|jsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = walk(root);
let failures = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  try {
    await transform(source, {
      loader: /\.jsx$/.test(file) ? 'jsx' : 'js',
      format: 'esm',
    });
  } catch (err) {
    failures++;
    const lines = (err.message || '').split('\n').filter(Boolean).slice(0, 4).join(' | ');
    console.error(`[lint] ${rel(file)}: ${lines}`);
  }
}

if (failures > 0) {
  console.error(`\nLint failed: ${failures} file(s) with syntax errors`);
  process.exit(1);
}

console.log(`[lint] OK - ${files.length} files checked, no syntax errors`);