import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'dev', '--', '--port', '5174', '--strictPort'], {
  cwd: "C:\\Users\\Standard\\Desktop\\The Raconteur's Commonplace",
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
