import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = "C:\\Users\\Standard\\Desktop\\The Raconteur's Commonplace";
const envText = readFileSync(resolve(root, '.env'), 'utf8');
const env = { ...process.env, BASE_PATH: '/The-Raconteur-s-Commonplace/' };

for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const result = spawnSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env,
});

process.exit(result.status ?? 1);
