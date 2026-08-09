/**
 * Build zero-JS pages for GitHub Pages.
 * Home page snapshot; interactive Find/Browse/Book POST to the Edge Function.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueEndpoint, renderPage } from './html.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'kobo-dist');

const supabaseUrl = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).replace(/\/$/, '');
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const functionBase = (
  process.env.KOBO_FUNCTION_URL ||
  (supabaseUrl ? catalogueEndpoint(supabaseUrl) : '')
).replace(/\/$/, '');
const pagesHome =
  process.env.PAGES_HOME ||
  'https://windshifter1.github.io/The-Raconteur-s-Commonplace/';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE URL or anon key for Kobo build.');
  process.exit(1);
}
if (!functionBase) {
  console.error('Missing KOBO_FUNCTION_URL.');
  process.exit(1);
}

async function fetchTable(name, query) {
  const res = await fetch(supabaseUrl + '/rest/v1/' + name + '?' + query, {
    headers: {
      apikey: supabaseKey,
      Authorization: 'Bearer ' + supabaseKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch ' + name + ': HTTP ' + res.status);
  }
  return res.json();
}

const shelves = await fetchTable('shelves', 'select=*&order=sort_order.asc');
const books = await fetchTable('books', 'select=*&order=title.asc');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const homeHtml = renderPage({
  shelves,
  books,
  actionBase: functionBase,
  apiKey: supabaseKey,
  pagesHome,
  view: 'home',
});
writeFileSync(join(outDir, 'index.html'), homeHtml, 'utf8');

console.log('Wrote kobo-dist/index.html');
console.log('Books:', books.length, 'Shelves:', shelves.length);
