/**
 * Dual-API book search for Add Books.
 * Google Books is proxied through the Edge Function so GOOGLE_BOOKS_API_KEY never ships to the client.
 * Open Library is also queried only on the proxy so the request can send a contact User-Agent.
 */
import config from './config.js';
import { budgetedSignal, timeoutError } from './net.js';

const DEBOUNCE_MS = 120;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_LIMIT = 24;
const REQUEST_TIMEOUT_MS = 15000;
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
/** Query key → in-flight request, so parallel callers share one round-trip. */
const inflight = new Map();

export function debounce(fn, wait = DEBOUNCE_MS) {
  let timer = 0;
  const wrapped = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => {
    window.clearTimeout(timer);
    timer = 0;
  };
  return wrapped;
}

function cacheKey(q) {
  return q.toLowerCase().trim();
}

function hitMatchesQuery(hit, q) {
  const n = q.toLowerCase().trim();
  if (!n) return true;
  const hay = [
    hit.title,
    ...(hit.authors || []),
    hit.publisher || '',
    hit.isbn || '',
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(n);
}

function liveCacheEntry(rawQuery) {
  const key = cacheKey(String(rawQuery || ''));
  const exact = cache.get(key);
  if (exact && Date.now() - exact.at < CACHE_TTL_MS) return exact;
  return null;
}

/** Exact cached results for this query, or null if we still need a network fetch. */
export function peekCachedResults(rawQuery) {
  const q = String(rawQuery || '').trim();
  if (q.length < 2) return null;
  const exact = liveCacheEntry(q);
  return exact ? exact.value.results : null;
}

/** Instant hits from earlier searches while a fresh request is in flight. */
export function peekLocalHits(rawQuery) {
  const q = String(rawQuery || '').trim();
  if (q.length < 2) return [];
  const exact = liveCacheEntry(q);
  if (exact) {
    return exact.value.results;
  }
  const key = cacheKey(q);
  let best = [];
  for (const [k, entry] of cache) {
    if (Date.now() - entry.at >= CACHE_TTL_MS) continue;
    if (!key.startsWith(k) && !k.startsWith(key)) continue;
    const filtered = (entry.value.results || []).filter((hit) => hitMatchesQuery(hit, q));
    if (filtered.length > best.length) best = filtered;
  }
  return best;
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

async function searchViaProxy(q, limit, signal, timeoutMs) {
  const url = config.bookSearchUrl;
  const key = config.supabaseAnonKey;
  if (!url || !key) throw new Error('Book search proxy is not configured.');
  const budget = budgetedSignal(signal, timeoutMs);
  let res;
  try {
    res = await fetch(`${url}?q=${encodeURIComponent(q)}&limit=${limit}`, {
      signal: budget.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    if (budget.timedOut) throw timeoutError(timeoutMs, 'Search');
    throw err;
  } finally {
    budget.release();
  }
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
 * @param {{ limit?: number, signal?: AbortSignal, timeoutMs?: number, tries?: number }} [opts]
 */
export async function searchBooks(rawQuery, opts = {}) {
  const q = String(rawQuery || '').trim();
  const limit = Math.max(4, Math.min(40, Number(opts.limit) || 20));
  if (q.length < 2) {
    return { results: [], errors: {}, empty: true, bothFailed: false };
  }

  const key = cacheKey(q);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return {
      ...cached.value,
      results: cached.value.results.slice(0, limit),
    };
  }

  const value = await sharedSearch(key, q, opts);
  return { ...value, results: value.results.slice(0, limit) };
}

/**
 * Batch callers repeat queries, so they share one round-trip. Abortable callers stay
 * separate: one cancellation must not take another caller's search down with it.
 */
function sharedSearch(key, q, opts) {
  if (opts.signal) return fetchSearch(q, opts);
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = fetchSearch(q, opts).finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

async function fetchSearch(q, opts) {
  const key = cacheKey(q);
  const timeoutMs = Number(opts.timeoutMs) || REQUEST_TIMEOUT_MS;
  const tries = Math.max(1, Number(opts.tries) || 1);
  let payload = null;
  let failure = null;
  let timedOut = false;

  // Upstream sometimes stalls on one query while the next is quick, so a timed-out
  // attempt is worth repeating rather than waiting on it.
  for (let attempt = 0; attempt < tries && !payload; attempt += 1) {
    try {
      payload = await searchViaProxy(q, FETCH_LIMIT, opts.signal, timeoutMs);
    } catch (err) {
      if (err?.name === 'AbortError') {
        return { results: [], errors: {}, empty: false, bothFailed: false, aborted: true };
      }
      failure = err;
      if (err?.name !== 'TimeoutError') break;
      timedOut = true;
    }
  }

  if (opts.signal?.aborted) {
    return { results: [], errors: {}, empty: false, bothFailed: false, aborted: true };
  }
  if (!payload) {
    const message = failure?.message || 'Book search is unavailable.';
    payload = {
      results: [],
      errors: { openLibrary: message, googleBooks: message },
      googleConfigured: false,
    };
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const errors = payload.errors || {};
  const bothFailed = !results.length && Boolean(errors.openLibrary && errors.googleBooks);
  const value = {
    results,
    errors,
    empty: !results.length && !bothFailed,
    bothFailed,
    timedOut,
    googleConfigured: Boolean(payload.googleConfigured),
    note: APP_UA_NOTE,
  };
  // A stall or an outage is not an answer worth remembering.
  if (!timedOut && !bothFailed) cache.set(key, { at: Date.now(), value });
  return value;
}
