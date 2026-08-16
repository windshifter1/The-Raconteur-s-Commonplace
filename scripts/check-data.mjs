import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1].trim(), m[2].trim()]),
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const slug = (env.VITE_ACCOUNT_SLUG || 'yusuf').trim().toLowerCase();

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const accountRes = await fetch(
  `${url}/rest/v1/accounts?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,books(id,title),shelves(id,name)&books.order=title.asc`,
  { headers },
);
const accountText = await accountRes.text();
console.log('account', slug, accountRes.status, accountText.slice(0, 800));
