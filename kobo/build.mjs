/**
 * Build zero-JS pages for GitHub Pages.
 * Prefer the live Edge Function URL for full catalogue behaviour on Kobo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './html.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'kobo-dist');

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const functionBase =
  process.env.KOBO_FUNCTION_URL ||
  (supabaseUrl ? supabaseUrl + '/functions/v1/catalogue' : '');

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
const books = await fetchTable('books', 'select=*&order=created_at.desc');

mkdirSync(outDir, { recursive: true });

// Full catalogue snapshot (works for reading even if function is down)
const liveUrl =
  functionBase +
  (functionBase.indexOf('?') >= 0 ? '&' : '?') +
  'apikey=' +
  encodeURIComponent(supabaseKey);

// Primary Pages entry: full zero-JS catalogue snapshot (loads on Kobo even
// before the Edge Function is deployed). Interactive links post to the live function.
const catalogueHtml = renderPage({
  shelves,
  books,
  actionBase: functionBase,
  apiKey: supabaseKey,
  view: 'catalogue',
  shelfId: null,
  query: '',
  sort: 'recent',
  status:
    'E-Ink snapshot (no JavaScript). Tap Live for search/add/edit once the catalogue service is deployed.',
});
writeFileSync(join(outDir, 'index.html'), catalogueHtml, 'utf8');

const gateway = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live catalogue link</title>
<style type="text/css">
body{margin:0;padding:24px;background:#fff;color:#000;font-family:Georgia,"Times New Roman",serif;}
a{color:#000;}
.btn{display:inline-block;border:1px solid #000;padding:10px 16px;text-decoration:none;}
p{font-family:Arial,Helvetica,sans-serif;font-size:16px;}
</style>
</head>
<body>
<h1>The Raconteur&#39;s Commonplace</h1>
<p>Bookmark this live catalogue on your Kobo (plain HTML, no JavaScript):</p>
<p><a class="btn" href="${liveUrl}">Open live catalogue</a></p>
<p><a href="./">Back to snapshot</a></p>
</body>
</html>
`;
writeFileSync(join(outDir, 'live.html'), gateway, 'utf8');

console.log('Wrote kobo-dist/index.html and live.html');
console.log('Books:', books.length, 'Shelves:', shelves.length);
console.log('Live function:', functionBase);
