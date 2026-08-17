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

type CoverRef = { url: string; source: 'open-library' | 'google-books' };

type LookupBook = {
  title: string;
  authors: string[];
  isbn: string | null;
  isbn10: string | null;
  isbn13: string | null;
  publicationYear: number | null;
  publisher: string | null;
  description: string | null;
  coverUrl: string | null;
  availableCovers: CoverRef[];
  source: 'open-library' | 'google-books' | 'both';
  sourceId: string;
  openLibraryId: string | null;
  googleBooksId: string | null;
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

function isbn10Checksum(d9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(d9[i]);
  const rem = (11 - (sum % 11)) % 11;
  return rem === 10 ? 'X' : String(rem);
}

function isbn13Checksum(d12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function validIsbn10(d: string): boolean {
  return /^[0-9]{9}[0-9X]$/.test(d) && isbn10Checksum(d.slice(0, 9)) === d[9];
}

function validIsbn13(d: string): boolean {
  return /^[0-9]{13}$/.test(d) && isbn13Checksum(d.slice(0, 12)) === d[12];
}

function isbn10To13(d: string): string | null {
  if (!validIsbn10(d)) return null;
  const core = `978${d.slice(0, 9)}`;
  return core + isbn13Checksum(core);
}

function isbn13To10(d: string): string | null {
  if (!validIsbn13(d) || !d.startsWith('978')) return null;
  const d9 = d.slice(3, 12);
  return d9 + isbn10Checksum(d9);
}

type NormalizedIsbn = { canonical: string; isbn10: string | null; isbn13: string };

function normalizeIsbn(value: unknown): NormalizedIsbn | null {
  const d = digitsIsbn(value);
  if (!d) return null;
  if (d.length === 10) {
    if (!validIsbn10(d)) return null;
    const isbn13 = isbn10To13(d);
    if (!isbn13) return null;
    return { canonical: isbn13, isbn10: d, isbn13 };
  }
  if (d.length === 13) {
    if (!validIsbn13(d)) return null;
    if (!d.startsWith('978') && !d.startsWith('979')) return null;
    return { canonical: d, isbn10: isbn13To10(d), isbn13: d };
  }
  return null;
}

function olHeaders(): HeadersInit {
  const email = (Deno.env.get('OPEN_LIBRARY_CONTACT_EMAIL') || 'yusuf@ilhaam.com').trim();
  return {
    Accept: 'application/json',
    'User-Agent': `The Raconteurs Commonplace/1.0 (contact: ${email})`,
    From: email,
  };
}

function descriptionFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && value && 'value' in (value as object)) {
    return String((value as { value?: string }).value || '').trim() || null;
  }
  return null;
}

function uniqueCovers(list: CoverRef[]): CoverRef[] {
  const seen = new Set<string>();
  const out: CoverRef[] = [];
  for (const item of list) {
    const url = String(item.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, source: item.source });
  }
  return out;
}

function googleCoverVariants(links: Record<string, string> | undefined): string[] {
  if (!links) return [];
  const raws = [
    links.extraLarge,
    links.large,
    links.medium,
    links.thumbnail,
    links.smallThumbnail,
  ];
  const out: string[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    const https = raw.replace(/^http:\/\//, 'https://').replace(/&edge=curl/g, '');
    out.push(https);
    if (https.includes('zoom=1')) out.push(https.replace('zoom=1', 'zoom=2'));
  }
  return [...new Set(out)];
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

/** ISBN first, then cover — applied when merging duplicates and ordering results. */
function catalogRank(hit: SearchHit): number {
  return (hit.isbn ? 2 : 0) + (hit.coverUrl ? 1 : 0);
}

function richer(a: SearchHit, b: SearchHit): SearchHit {
  const score = (h: SearchHit) =>
    catalogRank(h) * 10 + (h.publisher ? 1 : 0) + h.authors.length;
  return score(b) > score(a) ? b : a;
}

/** Stable: listings with an ISBN rise first; among those, jackets rise next. */
function preferCatalogHits(hits: SearchHit[]): SearchHit[] {
  return hits
    .map((hit, index) => ({ hit, index, rank: catalogRank(hit) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((entry) => entry.hit);
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
  const res = await fetch(url, { headers: olHeaders() });
  if (!res.ok) throw new Error(`Open Library request failed (${res.status}).`);
  const data = await res.json();
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  return docs.map(fromOpenLibrary).filter(Boolean) as SearchHit[];
}

function emptyLookup(partial: Partial<LookupBook> & Pick<LookupBook, 'title' | 'source' | 'sourceId'>): LookupBook {
  return {
    authors: [],
    isbn: null,
    isbn10: null,
    isbn13: null,
    publicationYear: null,
    publisher: null,
    description: null,
    coverUrl: null,
    availableCovers: [],
    openLibraryId: null,
    googleBooksId: null,
    ...partial,
  };
}

function olCover(kind: 'isbn' | 'id' | 'olid', value: string): string {
  return `https://covers.openlibrary.org/b/${kind}/${encodeURIComponent(value)}-L.jpg?default=false`;
}

async function lookupOpenLibrary(isbn: NormalizedIsbn): Promise<LookupBook | null> {
  const tryIds = [...new Set([isbn.isbn13, isbn.isbn10].filter(Boolean))] as string[];
  let edition: Record<string, unknown> | null = null;
  let editionKey = '';
  for (const id of tryIds) {
    const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(id)}.json`, {
      headers: olHeaders(),
    });
    if (res.ok) {
      edition = await res.json();
      editionKey = String(edition?.key || '');
      break;
    }
    if (res.status !== 404) throw new Error(`Open Library request failed (${res.status}).`);
  }

  const searchRes = await fetch(
    `${OPEN_LIBRARY}?isbn=${encodeURIComponent(isbn.isbn13)}&limit=5`,
    { headers: olHeaders() },
  );
  if (!searchRes.ok) throw new Error(`Open Library request failed (${searchRes.status}).`);
  const searchData = await searchRes.json();
  const docs = Array.isArray(searchData?.docs) ? searchData.docs as Record<string, unknown>[] : [];
  const doc = docs[0] || null;

  if (!edition && !doc) return null;

  let description: string | null = descriptionFrom(edition?.description);
  const workKey = Array.isArray(edition?.works)
    ? String((edition?.works as { key?: string }[])[0]?.key || '')
    : String(doc?.key || '');
  if (!description && workKey.startsWith('/works/')) {
    const workRes = await fetch(`https://openlibrary.org${workKey}.json`, { headers: olHeaders() });
    if (workRes.ok) {
      const work = await workRes.json();
      description = descriptionFrom(work?.description);
    }
  }

  const authors = Array.isArray(doc?.author_name)
    ? doc.author_name.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const covers: CoverRef[] = [];
  for (const id of tryIds) covers.push({ url: olCover('isbn', id), source: 'open-library' });
  const coverIds = [
    ...(Array.isArray(edition?.covers) ? edition.covers : []),
    doc?.cover_i,
  ];
  for (const raw of coverIds) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) covers.push({ url: olCover('id', String(n)), source: 'open-library' });
  }
  const olid = editionKey.replace(/^\/books\//, '');
  if (olid) covers.push({ url: olCover('olid', olid), source: 'open-library' });

  const availableCovers = uniqueCovers(covers);
  const title = String(edition?.title || doc?.title || '').trim();
  if (!title) return null;
  const isbn13 = pickIsbn([
    ...(Array.isArray(edition?.isbn_13) ? edition.isbn_13 : []),
    isbn.isbn13,
  ]) || isbn.isbn13;
  const isbn10 = pickIsbn([
    ...(Array.isArray(edition?.isbn_10) ? edition.isbn_10 : []),
    isbn.isbn10,
  ]) || isbn.isbn10;
  return emptyLookup({
    title,
    authors,
    isbn: isbn13,
    isbn10,
    isbn13,
    publicationYear: yearFrom(edition?.publish_date || doc?.first_publish_year),
    publisher: Array.isArray(edition?.publishers)
      ? String(edition.publishers[0] || '').trim() || null
      : Array.isArray(doc?.publisher)
        ? String(doc.publisher[0] || '').trim() || null
        : null,
    description,
    coverUrl: availableCovers[0]?.url || null,
    availableCovers,
    source: 'open-library',
    sourceId: editionKey || String(doc?.key || title),
    openLibraryId: workKey || editionKey || null,
  });
}

function googleLookupFromItem(item: Record<string, unknown>, isbn: NormalizedIsbn): LookupBook | null {
  const hit = fromGoogle(item);
  if (!hit) return null;
  const info = (item.volumeInfo || {}) as Record<string, unknown>;
  const ids = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers as { type?: string; identifier?: string }[] : [];
  const isbn13 = pickIsbn(ids.filter((r) => r.type === 'ISBN_13').map((r) => r.identifier)) || isbn.isbn13;
  const isbn10 = pickIsbn(ids.filter((r) => r.type === 'ISBN_10').map((r) => r.identifier)) || isbn.isbn10;
  const coverUrls = googleCoverVariants(info.imageLinks as Record<string, string> | undefined);
  const availableCovers = uniqueCovers(coverUrls.map((url) => ({ url, source: 'google-books' as const })));
  return emptyLookup({
    title: hit.title,
    authors: hit.authors,
    isbn: isbn13,
    isbn10,
    isbn13,
    publicationYear: hit.publicationYear,
    publisher: hit.publisher,
    description: descriptionFrom(info.description),
    coverUrl: availableCovers[0]?.url || hit.coverUrl,
    availableCovers,
    source: 'google-books',
    sourceId: hit.sourceId,
    googleBooksId: hit.googleBooksId,
  });
}

async function lookupGoogle(isbn: NormalizedIsbn, key: string): Promise<LookupBook | null> {
  const tryIds = [...new Set([isbn.isbn13, isbn.isbn10].filter(Boolean))] as string[];
  let items: Record<string, unknown>[] = [];
  for (const id of tryIds) {
    const url = `${GOOGLE_BOOKS}?q=isbn:${encodeURIComponent(id)}&maxResults=5&printType=books&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(res.status === 403 || res.status === 400
        ? 'Google Books is not available with the current key.'
        : `Google Books request failed (${res.status}). ${text.slice(0, 120)}`);
    }
    const data = await res.json();
    items = Array.isArray(data?.items) ? data.items : [];
    if (items.length) break;
  }
  if (!items.length) return null;
  const exact = items.find((item) => {
    const info = (item.volumeInfo || {}) as Record<string, unknown>;
    const ids = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers as { identifier?: string }[] : [];
    return ids.some((row) => {
      const n = normalizeIsbn(row.identifier);
      return n && n.canonical === isbn.canonical;
    });
  }) || items[0];
  return googleLookupFromItem(exact, isbn);
}

function mergeLookup(ol: LookupBook | null, gb: LookupBook | null): LookupBook | null {
  if (!ol) return gb;
  if (!gb) return ol;
  const availableCovers = uniqueCovers([...gb.availableCovers, ...ol.availableCovers]);
  const gbDesc = gb.description || '';
  const olDesc = ol.description || '';
  return {
    title: gb.title || ol.title,
    authors: gb.authors.length ? gb.authors : ol.authors,
    isbn: gb.isbn13 || ol.isbn13 || gb.isbn || ol.isbn,
    isbn10: gb.isbn10 || ol.isbn10,
    isbn13: gb.isbn13 || ol.isbn13,
    publicationYear: gb.publicationYear || ol.publicationYear,
    publisher: gb.publisher || ol.publisher,
    description: gbDesc.length >= olDesc.length ? (gb.description || ol.description) : (ol.description || gb.description),
    coverUrl: gb.coverUrl || ol.coverUrl || availableCovers[0]?.url || null,
    availableCovers,
    source: 'both',
    sourceId: gb.sourceId || ol.sourceId,
    openLibraryId: ol.openLibraryId,
    googleBooksId: gb.googleBooksId,
  };
}

async function handleIsbnLookup(raw: string, googleKey: string): Promise<Response> {
  const isbn = normalizeIsbn(raw);
  if (!isbn) {
    return json({
      lookup: true,
      found: false,
      invalidIsbn: true,
      book: null,
      errors: {},
      googleConfigured: Boolean(googleKey),
    });
  }
  const [ol, gb] = await Promise.allSettled([
    lookupOpenLibrary(isbn),
    googleKey
      ? lookupGoogle(isbn, googleKey)
      : Promise.reject(new Error('Google Books API key has not been added yet.')),
  ]);
  const errors: Record<string, string> = {};
  const olBook = ol.status === 'fulfilled' ? ol.value : null;
  const gbBook = gb.status === 'fulfilled' ? gb.value : null;
  if (ol.status === 'rejected') errors.openLibrary = ol.reason?.message || 'Open Library is unavailable.';
  if (gb.status === 'rejected') errors.googleBooks = gb.reason?.message || 'Google Books is unavailable.';
  const book = mergeLookup(olBook, gbBook);
  if (!book) {
    const bothFailed = Boolean(errors.openLibrary && errors.googleBooks);
    return json({
      lookup: true,
      found: false,
      invalidIsbn: false,
      book: null,
      errors,
      isbn: isbn.canonical,
      googleConfigured: Boolean(googleKey),
    }, bothFailed ? 502 : 200);
  }
  return json({
    lookup: true,
    found: true,
    book,
    errors,
    isbn: isbn.canonical,
    googleConfigured: Boolean(googleKey),
  });
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
  let isbn = '';
  let limit = 20;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      q = String(url.searchParams.get('q') || '').trim();
      isbn = String(url.searchParams.get('isbn') || '').trim();
      limit = Number(url.searchParams.get('limit') || 20) || 20;
    } else {
      const body = await req.json().catch(() => ({}));
      q = String(body.q || '').trim();
      isbn = String(body.isbn || '').trim();
      limit = Number(body.limit || 20) || 20;
    }
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const googleKey = (Deno.env.get('GOOGLE_BOOKS_API_KEY') || '').trim();
  if (isbn) return await handleIsbnLookup(isbn, googleKey);

  if (q.length < 2) {
    return json({ results: [], errors: {}, query: q });
  }
  limit = Math.max(4, Math.min(40, limit));

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
    results: preferCatalogHits(interleaveSources(mergeHits(hits))).slice(0, limit),
    errors,
    query: q,
    googleConfigured: Boolean(googleKey),
  });
});
