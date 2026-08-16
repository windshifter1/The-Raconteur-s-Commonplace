/**
 * Build zero-JS pages for GitHub Pages.
 * Home page snapshot; interactive Find/Browse/Book POST to the Edge Function.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueEndpoint, renderPage } from './html.mjs';
import { loadAccountCatalogue } from '../lib/account-catalogue.js';

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

const accountSlug = process.env.VITE_ACCOUNT_SLUG || 'yusuf';
const { shelves, books } = await loadAccountCatalogue(
  { supabaseUrl, supabaseAnonKey: supabaseKey, accountSlug },
  { includeShelves: true },
);

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
