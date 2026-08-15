import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = "C:\\Users\\Standard\\Desktop\\The Raconteur's Commonplace";
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (existsSync(root + '\\.supabase-token')
    ? readFileSync(root + '\\.supabase-token', 'utf8').trim()
    : '');

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN (env or .supabase-token file).');
  console.error('Create one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  [
    'supabase',
    'functions',
    'deploy',
    'catalogue',
    '--project-ref',
    'joctuzargvajerqwxuvn',
    '--no-verify-jwt',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  },
);

const searchResult = spawnSync(
  'npx',
  [
    'supabase',
    'functions',
    'deploy',
    'book-search',
    '--project-ref',
    'joctuzargvajerqwxuvn',
    '--no-verify-jwt',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  },
);

process.exit(searchResult.status ?? result.status ?? 1);
