/**
 * Catalogue access is database → account → data.
 * The public site currently uses Yusuf; swap accountSlug later for other libraries.
 */

export const DEFAULT_ACCOUNT_SLUG = 'yusuf';

function restRoot(config) {
  return String(config?.supabaseUrl || '').replace(/\/$/, '');
}

export function restHeaders(config, extra = {}) {
  const key = config?.supabaseAnonKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    ...extra,
  };
}

export function accountSlug(config) {
  const slug = String(config?.accountSlug || DEFAULT_ACCOUNT_SLUG).trim().toLowerCase();
  return slug || DEFAULT_ACCOUNT_SLUG;
}

export function accountsUrl(config) {
  const root = restRoot(config);
  return root ? `${root}/rest/v1/accounts` : '';
}

export function booksUrl(config) {
  const root = restRoot(config);
  return root ? `${root}/rest/v1/books` : '';
}

/** @type {{ slug: string, account: { id: string, name: string, slug: string } } | null} */
let accountCache = null;

export function forgetAccountCache() {
  accountCache = null;
}

/**
 * Resolve the active account (Yusuf until login exists).
 * @param {object} config
 */
export async function loadAccount(config) {
  const slug = accountSlug(config);
  if (accountCache?.slug === slug) return accountCache.account;

  const url = accountsUrl(config);
  const key = config?.supabaseAnonKey;
  if (!url || !key) {
    throw new Error('Catalogue is not configured. Run npm run build:full with .env set.');
  }

  const res = await fetch(`${url}?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug`, {
    headers: restHeaders(config),
  });
  if (!res.ok) {
    throw new Error(`Account lookup failed (${res.status}).`);
  }
  const rows = await res.json();
  const account = Array.isArray(rows) ? rows[0] : rows;
  if (!account?.id) {
    throw new Error('Catalogue account was not found.');
  }
  accountCache = { slug, account };
  return account;
}

function embedBooksSelect(bookColumns) {
  const cols = String(bookColumns || '*').trim() || '*';
  return `books(${cols})`;
}

/**
 * Load nested catalogue rows for the active account.
 * @param {object} config
 * @param {{ bookColumns?: string, bookOrder?: string, includeShelves?: boolean }} [opts]
 */
export async function loadAccountCatalogue(config, opts = {}) {
  const account = await loadAccount(config);
  const url = accountsUrl(config);
  const selectParts = ['id', 'name', 'slug', embedBooksSelect(opts.bookColumns)];
  if (opts.includeShelves) selectParts.splice(3, 0, 'shelves(*)');

  const params = [
    `id=eq.${account.id}`,
    `select=${selectParts.join(',')}`,
    `books.order=${opts.bookOrder || 'title.asc'}`,
  ];
  if (opts.includeShelves) params.push('shelves.order=sort_order.asc');

  const res = await fetch(`${url}?${params.join('&')}`, {
    headers: restHeaders(config),
  });
  if (!res.ok) {
    throw new Error(`Catalogue request failed (${res.status}).`);
  }
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new Error('Catalogue account was not found.');
  }
  const shelves = Array.isArray(row.shelves) ? row.shelves : [];
  const books = Array.isArray(row.books) ? row.books : [];
  return { account, shelves, books };
}

/**
 * Nested book lookup under the active account, with extra PostgREST book filters.
 * @param {object} config
 * @param {string} bookQuery  e.g. "isbn=eq.978…&limit=5"
 * @param {string} [bookColumns]
 */
export async function loadAccountBooksWhere(config, bookQuery, bookColumns = '*') {
  const account = await loadAccount(config);
  const url = accountsUrl(config);
  const extra = String(bookQuery || '')
    .split('&')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith('books.') ? part : `books.${part}`))
    .join('&');
  const qs = [
    `id=eq.${account.id}`,
    `select=id,${embedBooksSelect(bookColumns)}`,
    extra,
  ]
    .filter(Boolean)
    .join('&');
  const res = await fetch(`${url}?${qs}`, { headers: restHeaders(config) });
  if (!res.ok) {
    throw new Error(`Catalogue lookup failed (${res.status}).`);
  }
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    account,
    books: Array.isArray(row?.books) ? row.books : [],
  };
}
