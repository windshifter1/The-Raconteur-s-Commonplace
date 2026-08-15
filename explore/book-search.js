/**
 * Dual-API book search for Add Books.
 * Google Books is proxied through the Edge Function so GOOGLE_BOOKS_API_KEY never ships to the client.
 * Open Library is queried here as a fallback if the proxy is unavailable.
 */
import config from './config.js';

const DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 5 * 60 * 1000;
const APP_UA_NOTE = 'The Raconteur’s Commonplace catalogue';

/** @typedef {{
 *  title: string,
 *  authors: string[],
 *  publicationYear: number | null,
 *  coverUrl: string | null,
 *  isbn: string | null,
 *  source: 'open-library' | 'google-books' | 'both',
 *  sourceId: string,
 *  openLibraryId: string | null,
 *  googleBooksId: string | null,
 *  publisher: string | null,
 * }} BookSearchHit */

const cache = new Map();

export function debounce(fn, wait = DEBOUNCE_MS) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function cacheKey(q, limit) {
  return `${q.toLowerCase().trim()}::${limit}`;
}

function yearFrom(value) {
  const n = Number(String(value ?? '').slice(0, 4));
  return Number.isFinite(n) && n >= 1000 && n <= 2100 ? n : null;
}

function digitsIsbn(value) {
  const d = String(value ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (d.length === 10 || d.length === 13) return d;
  return null;
}

function pickIsbn(values) {
  const cleaned = values.map(digitsIsbn).filter(Boolean);
  return cleaned.find((v) => v.length === 13) || cleaned[0] || null;
}

function fromOpenLibrary(doc) {
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

function fingerprint(hit) {
  if (hit.isbn) return `isbn:${hit.isbn}`;
  const title = hit.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const author = (hit.authors[0] || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const year = hit.publicationYear ? String(hit.publicationYear) : '';
  return `ta:${title}|${author}|${year}`;
}

function richer(a, b) {
  const score = (h) =>
    (h.coverUrl ? 4 : 0) + (h.isbn ? 2 : 0) + (h.publisher ? 1 : 0) + h.authors.length;
  return score(b) > score(a) ? b : a;
}

export function mergeHits(list) {
  const map = new Map();
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

export function interleaveSources(hits) {
  const ol = [];
  const gb = [];
  const both = [];
  for (const hit of hits) {
    if (hit.source === 'google-books') gb.push(hit);
    else if (hit.source === 'both') both.push(hit);
    else ol.push(hit);
  }
  const out = [...both];
  const n = Math.max(ol.length, gb.length);
  for (let i = 0; i < n; i++) {
    if (ol[i]) out.push(ol[i]);
    if (gb[i]) out.push(gb[i]);
  }
  return out;
}

async function searchOpenLibraryDirect(q, limit) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open Library request failed (${res.status}).`);
  const data = await res.json();
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  return docs.map(fromOpenLibrary).filter(Boolean);
}

async function searchViaProxy(q, limit) {
  const url = config.bookSearchUrl;
  const key = config.supabaseAnonKey;
  if (!url || !key) throw new Error('Book search proxy is not configured.');
  const res = await fetch(`${url}?q=${encodeURIComponent(q)}&limit=${limit}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !Array.isArray(data?.results)) {
    throw new Error(data?.error || `Book search failed (${res.status}).`);
  }
  return {
    results: Array.isArray(data.results) ? data.results : [],
    errors: data.errors && typeof data.errors === 'object' ? data.errors : {},
    googleConfigured: Boolean(data.googleConfigured),
  };
}

/**
 * @param {string} rawQuery
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ results: BookSearchHit[], errors: Record<string,string>, empty: boolean, bothFailed: boolean }>}
 */
export async function searchBooks(rawQuery, opts = {}) {
  const q = String(rawQuery || '').trim();
  const limit = Math.max(4, Math.min(40, Number(opts.limit) || 20));
  if (q.length < 2) {
    return { results: [], errors: {}, empty: true, bothFailed: false };
  }

  const key = cacheKey(q, limit);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  let payload;
  try {
    payload = await searchViaProxy(q, limit);
  } catch (err) {
    try {
      const ol = await searchOpenLibraryDirect(q, limit);
      payload = {
        results: interleaveSources(mergeHits(ol)).slice(0, limit),
        errors: {
          googleBooks: 'Google Books is reached through the catalogue proxy once GOOGLE_BOOKS_API_KEY is set.',
        },
        googleConfigured: false,
      };
    } catch (olErr) {
      payload = {
        results: [],
        errors: {
          openLibrary: olErr?.message || 'Open Library is unavailable.',
          googleBooks: err?.message || 'Google Books is unavailable.',
        },
        googleConfigured: false,
      };
    }
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const errors = payload.errors || {};
  const bothFailed = !results.length && Boolean(errors.openLibrary && errors.googleBooks);
  const value = {
    results,
    errors,
    empty: !results.length && !bothFailed,
    bothFailed,
    googleConfigured: Boolean(payload.googleConfigured),
    note: APP_UA_NOTE,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}
