/**
 * ISBN metadata via the book-search proxy. UI never talks to Google Books / Open Library directly.
 */
import config from './config.js';
import { budgetedSignal } from './net.js';
import { normalizeIsbn } from './isbn.js';

const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
/** ISBN → in-flight request, so parallel callers share one round-trip. */
const inflight = new Map();

function cacheGet(isbn13) {
  const hit = cache.get(isbn13);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(isbn13);
    return null;
  }
  return hit.value;
}

/**
 * @typedef {{
 *  title: string,
 *  authors: string[],
 *  isbn: string | null,
 *  isbn10: string | null,
 *  isbn13: string | null,
 *  publicationYear: number | null,
 *  publisher: string | null,
 *  description: string | null,
 *  coverUrl: string | null,
 *  availableCovers: { url: string, source: string }[],
 *  source: string,
 *  sourceId: string,
 *  openLibraryId: string | null,
 *  googleBooksId: string | null,
 * }} LookupBook
 */

/**
 * @param {string} raw
 * @param {{ timeoutMs?: number, tries?: number }} [opts]
 */
export async function lookupIsbn(raw, opts = {}) {
  const normalized = normalizeIsbn(raw);
  if (!normalized) {
    return { kind: 'invalid', book: null, errors: {} };
  }
  const cached = cacheGet(normalized.canonical);
  if (cached) return cached;

  // A batch can ask for the same edition from several rows at once; one request serves all.
  const pending = inflight.get(normalized.canonical);
  if (pending) return pending;
  const run = fetchIsbn(normalized, opts).finally(() => inflight.delete(normalized.canonical));
  inflight.set(normalized.canonical, run);
  return run;
}

async function fetchIsbn(normalized, opts) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'network', book: null, errors: { network: 'Network unavailable' }, isbn: normalized };
  }

  const url = config.bookSearchUrl;
  const key = config.supabaseAnonKey;
  if (!url || !key) {
    return { kind: 'error', book: null, errors: { proxy: 'Book search proxy is not configured.' }, isbn: normalized };
  }

  const timeoutMs = Number(opts.timeoutMs) || REQUEST_TIMEOUT_MS;
  const tries = Math.max(1, Number(opts.tries) || 1);
  let res = null;
  let timedOut = false;
  // A stalled query is worth asking again; a refused one is not.
  for (let attempt = 0; attempt < tries && !res; attempt += 1) {
    const budget = budgetedSignal(undefined, timeoutMs);
    try {
      res = await fetch(`${url}?isbn=${encodeURIComponent(normalized.canonical)}`, {
        signal: budget.signal,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
      });
    } catch {
      if (!budget.timedOut) {
        return { kind: 'network', book: null, errors: { network: 'Network unavailable' }, isbn: normalized };
      }
      timedOut = true;
    } finally {
      budget.release();
    }
  }
  if (!res) {
    return {
      kind: 'network',
      book: null,
      timedOut,
      errors: { network: `Lookup timed out after ${Math.round(timeoutMs / 1000)}s.` },
      isbn: normalized,
    };
  }

  const data = await res.json().catch(() => ({}));
  if (data?.invalidIsbn) {
    return { kind: 'invalid', book: null, errors: {}, isbn: normalized };
  }

  const bothFailed = Boolean(data?.errors?.openLibrary && data?.errors?.googleBooks);
  if (!res.ok && !data?.found) {
    return {
      kind: bothFailed || res.status >= 500 ? 'error' : 'not-found',
      book: null,
      errors: data?.errors || {},
      isbn: normalized,
    };
  }
  if (!data?.found || !data?.book) {
    return {
      kind: bothFailed ? 'error' : 'not-found',
      book: null,
      errors: data?.errors || {},
      isbn: normalized,
    };
  }

  const book = data.book;
  const covers = Array.isArray(book.availableCovers) ? book.availableCovers : [];
  const value = {
    kind: 'found',
    isbn: normalized,
    errors: data.errors || {},
    book: {
      title: book.title,
      authors: Array.isArray(book.authors) ? book.authors : [],
      isbn: book.isbn13 || book.isbn || normalized.isbn13,
      isbn10: book.isbn10 || normalized.isbn10,
      isbn13: book.isbn13 || normalized.isbn13,
      publicationYear: book.publicationYear ?? null,
      publisher: book.publisher ?? null,
      description: book.description ?? null,
      coverUrl: book.coverUrl || covers[0]?.url || null,
      availableCovers: covers,
      source: book.source || 'open-library',
      sourceId: book.sourceId || normalized.isbn13,
      openLibraryId: book.openLibraryId || null,
      googleBooksId: book.googleBooksId || null,
    },
  };
  cache.set(normalized.canonical, { at: Date.now(), value });
  return value;
}
