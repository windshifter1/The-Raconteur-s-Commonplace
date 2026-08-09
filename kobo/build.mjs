/**
 * Build zero-JS pages for GitHub Pages.
 * Home page snapshot; interactive Find/Browse/Book POST to the Edge Function.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './html.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'kobo-dist');

const supabaseUrl = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).replace(/\/$/, '');
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const functionBase =
  process.env.KOBO_FUNCTION_URL ||
  (supabaseUrl ? supabaseUrl + '/functions/v1/catalogue' : '');
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

const liveUrl =
  functionBase +
  (functionBase.indexOf('?') >= 0 ? '&' : '?') +
  'apikey=' +
  encodeURIComponent(supabaseKey);

const gateway = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open catalogue</title>
<style type="text/css">
body{margin:0;padding:24px;background:#fff;color:#000;font-family:Georgia,"Times New Roman",serif;}
a{color:#000;}
.btn{display:inline-block;border:1px solid #000;padding:10px 16px;background:#fff;font:inherit;cursor:pointer;}
p{font-family:Arial,Helvetica,sans-serif;font-size:16px;}
</style>
</head>
<body>
<h1>The Raconteur&#39;s Commonplace</h1>
<p>Use the home page for everyday browsing. This button opens the live catalogue server.</p>
<form method="post" action="${liveUrl}">
<input type="hidden" name="action" value="view">
<input type="hidden" name="view" value="home">
<p><input class="btn" type="submit" value="Open live home"></p>
</form>
<p><a href="./">Back to site home</a></p>
</body>
</html>
`;
writeFileSync(join(outDir, 'live.html'), gateway, 'utf8');

console.log('Wrote kobo-dist/index.html and live.html');
console.log('Books:', books.length, 'Shelves:', shelves.length);
