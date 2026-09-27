/**
 * Catches `ReferenceError: X is not defined` before the browser does.
 *
 * The lint script only parses, and Vite/esbuild does not resolve free
 * identifiers, so a component referenced but never imported builds fine and
 * then blanks the page at runtime. This checks the component-shaped
 * identifiers JSX actually renders.
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = ['src'];
const files = [];

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
  }
};

roots.forEach(walk);

// Names that are ambient in a browser module and legitimately not imported.
const AMBIENT = new Set([
  'React',
  'Fragment',
  'Suspense',
  'StrictMode',
  'Children',
  'Component',
  'createElement',
]);

const problems = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');

  // Strip comments so prose like `<JWT>` or `<RoleRoute>` in a docblock is
  // never mistaken for a rendered component.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  // Everything the file imports or declares locally.
  const known = new Set(AMBIENT);

  for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s+['"]/g)) {
    const clause = m[1];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const name = part.split(/\s+as\s+/).pop().trim();
        if (name) known.add(name);
      }
    }
    const def = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
    if (def && !def.startsWith('*')) known.add(def);
  }

  // Local declarations: const/let/var/function/class/param-ish bindings.
  for (const m of src.matchAll(
    /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g
  )) {
    known.add(m[1]);
  }

  // Destructured consts, e.g. `const { A, B } = x` and multi-name.
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().split('=')[0].trim();
      if (name) known.add(name);
    }
  }

  // Function parameters. A param may be renamed (`icon: Icon = Inbox`), so
  // keep the LAST identifier of each comma segment - that is the local name.
  for (const m of src.matchAll(
    /(?:function\s+\w+|\([^)]*\)|\w+)\s*(?:=\s*)?\(([^)]{0,400})\)\s*(?:=>|\{)/g
  )) {
    for (const part of m[1].split(',')) {
      const names = part
        .replace(/[.=[\]{}]/g, ' ')
        .split(/[\s:]+/)
        .filter(Boolean);
      const local = names[names.length - 1];
      if (local && /^[A-Za-z_$][\w$]*$/.test(local)) known.add(local);
    }
  }

  // JSX component usage: <Name, plus any bare capitalized identifier used as a
  // JSX expression value (icon={Icon}, navItems={ADMIN_NAV}, as={Page}, ...).
  const used = new Map();
  const bump = (n) => used.set(n, (used.get(n) || 0) + 1);

  for (const m of src.matchAll(/<([A-Z][\w$]*)/g)) bump(m[1]);
  for (const m of src.matchAll(/\{\s*([A-Z][\w$]*)\s*\}/g)) bump(m[1]);

  for (const [name, count] of used) {
    if (!known.has(name)) {
      problems.push({ file, name, count });
    }
  }
}

if (problems.length === 0) {
  console.log(`[undefined-identifiers] OK - ${files.length} files checked`);
  process.exit(0);
}

console.log(`[undefined-identifiers] ${problems.length} problem(s):`);
for (const p of problems) {
  console.log(`  ${p.file}: <${p.name}/> used ${p.count}x but never imported or declared`);
}
process.exit(1);
