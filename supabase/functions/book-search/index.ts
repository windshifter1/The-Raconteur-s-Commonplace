/**
 * Dual-API book search proxy.
 * Keeps GOOGLE_BOOKS_API_KEY on the server. Open Library needs no key.
 */
const OPEN_LIBRARY = 'https://openlibrary.org/search.json';
const GOOGLE_BOOKS = 'https://www.googleapis.com/books/v1/volumes';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'cache-control': 'no-store',
};

type SearchHit = {
  title: string;
  authors: string[];
  publicationYear: number | null;
  coverUrl: string | null;
  isbn: string | null;
  source: 'open-library' | 'google-books' | 'both';
  sourceId: string;
  openLibraryId: string | null;
  googleBooksId: string | null;
  publisher: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function yearFrom(value: unknown): number | null {
  const n = Number(String(value ?? '').slice(0, 4));
  return Number.isFinite(n) && n >= 1000 && n <= 2100 ? n : null;
}

function digitsIsbn(value: unknown): string | null {
  const d = String(value ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (d.length === 10 || d.length === 13) return d;
  return null;
}

function pickIsbn(values: unknown[]): string | null {
  const cleaned = values.map(digitsIsbn).filter(Boolean) as string[];
  return cleaned.find((v) => v.length === 13) || cleaned[0] || null;
}

function googleCover(links: Record<string, string> | undefined): string | null {
  if (!links) return null;
  const raw =
    links.large ||
    links.medium ||
    links.thumbnail ||
    links.smallThumbnail ||
    links.extraLarge ||
    '';
  if (!raw) return null;
  return raw.replace(/^http:\/\//, 'https://').replace(/&edge=curl/g, '');
}

function fromOpenLibrary(doc: Record<string, unknown>): SearchHit | null {
  const title = String(doc.title || '').trim();
  if (!title) return null;
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const coverId = Number(doc.cover_i);
  const key = String(doc.key || '').trim();
  return {
    title,
    authors,
    publicationYear: yearFrom(doc.first_publish_year),
    coverUrl: Number.isFinite(coverId) && coverId > 0
      ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
      : null,
    isbn: pickIsbn(Array.isArray(doc.isbn) ? doc.isbn : []),
    source: 'open-library',
    sourceId: key || title,
    openLibraryId: key || null,
    googleBooksId: null,
    publisher: Array.isArray(doc.publisher) ? String(doc.publisher[0] || '') || null : null,
  };
}

function fromGoogle(item: Record<string, unknown>): SearchHit | null {
  const info = (item.volumeInfo || {}) as Record<string, unknown>;
  const title = String(info.title || '').trim();
  if (!title) return null;
  const authors = Array.isArray(info.authors)
    ? info.authors.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const ids = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
  const isbn = pickIsbn(
    ids.map((row) => (row as { identifier?: string }).identifier),
  );
  const id = String(item.id || '').trim();
  return {
    title,
    authors,
    publicationYear: yearFrom(info.publishedDate),
    coverUrl: googleCover(info.imageLinks as Record<string, string> | undefined),
    isbn,
    source: 'google-books',
    sourceId: id || title,
    openLibraryId: null,
    googleBooksId: id || null,
    publisher: String(info.publisher || '').trim() || null,
  };
}

function fingerprint(hit: SearchHit): string {
  const isbn = hit.isbn;
  if (isbn) return `isbn:${isbn}`;
  const title = hit.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const author = (hit.authors[0] || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const year = hit.publicationYear ? String(hit.publicationYear) : '';
  return `ta:${title}|${author}|${year}`;
}

function richer(a: SearchHit, b: SearchHit): SearchHit {
  const score = (h: SearchHit) =>
    (h.coverUrl ? 4 : 0) + (h.isbn ? 2 : 0) + (h.publisher ? 1 : 0) + h.authors.length;
  return score(b) > score(a) ? b : a;
}

function mergeHits(list: SearchHit[]): SearchHit[] {
  const map = new Map<string, SearchHit>();
  for (const hit of list) {
    const key = fingerprint(hit);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, hit);
      continue;
    }
    const keep = richer(prev, hit);
    const other = keep === prev ? hit : prev;
    map.set(key, {
      ...keep,
      isbn: keep.isbn || other.isbn,
      coverUrl: keep.coverUrl || other.coverUrl,
      publicationYear: keep.publicationYear || other.publicationYear,
      publisher: keep.publisher || other.publisher,
      authors: keep.authors.length ? keep.authors : other.authors,
      openLibraryId: keep.openLibraryId || other.openLibraryId,
      googleBooksId: keep.googleBooksId || other.googleBooksId,
      source: keep.source === other.source ? keep.source : 'both',
      sourceId: keep.googleBooksId || keep.openLibraryId || keep.sourceId,
    });
  }
  return [...map.values()];
}

/** Alternate Open Library / Google Books so one API cannot bury the other. */
function interleaveSources(hits: SearchHit[]): SearchHit[] {
  const ol: SearchHit[] = [];
  const gb: SearchHit[] = [];
  const both: SearchHit[] = [];
  for (const hit of hits) {
    if (hit.source === 'google-books') gb.push(hit);
    else if (hit.source === 'both') both.push(hit);
    else ol.push(hit);
  }
  const out: SearchHit[] = [...both];
  const n = Math.max(ol.length, gb.length);
  for (let i = 0; i < n; i++) {
    if (ol[i]) out.push(ol[i]);
    if (gb[i]) out.push(gb[i]);
  }
  return out;
}

async function searchOpenLibrary(q: string, limit: number): Promise<SearchHit[]> {
  const url = `${OPEN_LIBRARY}?q=${encodeURIComponent(q)}&limit=${limit}`;
  const email = (Deno.env.get('OPEN_LIBRARY_CONTACT_EMAIL') || 'yusuf@ilhaam.com').trim();
  const ua = `The Raconteurs Commonplace/1.0 (contact: ${email})`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': ua,
      From: email,
    },
  });
  if (!res.ok) throw new Error(`Open Library request failed (${res.status}).`);
  const data = await res.json();
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  return docs.map(fromOpenLibrary).filter(Boolean) as SearchHit[];
}

async function searchGoogle(q: string, limit: number, key: string): Promise<SearchHit[]> {
  const url = `${GOOGLE_BOOKS}?q=${encodeURIComponent(q)}&maxResults=${Math.min(40, limit)}&printType=books&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(res.status === 403 || res.status === 400
      ? 'Google Books is not available with the current key.'
      : `Google Books request failed (${res.status}). ${text.slice(0, 120)}`);
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map(fromGoogle).filter(Boolean) as SearchHit[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  let q = '';
  let limit = 20;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      q = String(url.searchParams.get('q') || '').trim();
      limit = Number(url.searchParams.get('limit') || 20) || 20;
    } else {
      const body = await req.json().catch(() => ({}));
      q = String(body.q || '').trim();
      limit = Number(body.limit || 20) || 20;
    }
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  if (q.length < 2) {
    return json({ results: [], errors: {}, query: q });
  }
  limit = Math.max(4, Math.min(40, limit));
  const googleKey = (Deno.env.get('GOOGLE_BOOKS_API_KEY') || '').trim();

  const [ol, gb] = await Promise.allSettled([
    searchOpenLibrary(q, limit),
    googleKey
      ? searchGoogle(q, limit, googleKey)
      : Promise.reject(new Error('Google Books API key has not been added yet.')),
  ]);

  const errors: Record<string, string> = {};
  const hits: SearchHit[] = [];
  if (ol.status === 'fulfilled') hits.push(...ol.value);
  else errors.openLibrary = ol.reason?.message || 'Open Library is unavailable.';
  if (gb.status === 'fulfilled') hits.push(...gb.value);
  else errors.googleBooks = gb.reason?.message || 'Google Books is unavailable.';

  if (!hits.length && (errors.openLibrary || errors.googleBooks)) {
    const bothFailed = Boolean(errors.openLibrary && errors.googleBooks);
    return json({
      results: [],
      errors,
      query: q,
      googleConfigured: Boolean(googleKey),
    }, bothFailed ? 502 : 200);
  }

  return json({
    results: interleaveSources(mergeHits(hits)).slice(0, limit),
    errors,
    query: q,
    googleConfigured: Boolean(googleKey),
  });
});
