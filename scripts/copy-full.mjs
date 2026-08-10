import { cpSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'kobo-dist');
const src = join(root, 'full');
const out = join(dist, 'full');

if (!existsSync(src)) {
  console.error('Missing full/ experience source');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of readdirSync(src)) {
  if (file === 'node_modules' || file === 'dist' || file.startsWith('.')) continue;
  if (file === 'package.json' || file === 'package-lock.json') continue;
  if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.tsbuildinfo')) continue;
  cpSync(join(src, file), join(out, file), { recursive: true });
}

console.log('Wrote kobo-dist/full/');
