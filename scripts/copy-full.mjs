import { cpSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'kobo-dist');

const configResult = spawnSync(process.execPath, [join(__dirname, 'write-runtime-config.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (configResult.status !== 0) {
  process.exit(configResult.status ?? 1);
}

function copyExperience(name) {
  const src = join(root, name);
  const out = join(dist, name);

  if (!existsSync(src)) {
    console.error(`Missing ${name}/ experience source`);
    process.exit(1);
  }

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const file of readdirSync(src)) {
    if (file === 'node_modules' || file === 'dist' || file.startsWith('.')) continue;
    if (file === 'package.json' || file === 'package-lock.json') continue;
    if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.tsbuildinfo')) continue;
    if (file.endsWith('.test.js') || file.endsWith('.test.mjs')) continue;
    cpSync(join(src, file), join(out, file), { recursive: true });
  }

  console.log(`Wrote kobo-dist/${name}/`);
}

copyExperience('full');
copyExperience('edit');
copyExperience('explore');

function copyPwa() {
  for (const file of ['manifest.webmanifest', 'sw.js', 'pwa.js']) {
    const src = join(root, file);
    if (!existsSync(src)) continue;
    cpSync(src, join(dist, file));
  }
  const icons = join(root, 'icons');
  if (existsSync(icons)) {
    cpSync(icons, join(dist, 'icons'), { recursive: true });
  }
  console.log('Wrote kobo-dist PWA manifest, icons, and service worker');
}

copyPwa();
