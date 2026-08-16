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

function placeholderAccount(config) {
  return { id: null, name: 'Yusuf', slug: accountSlug(config) };
}

function isMissingAccountSchema(res, body) {
  if (res.ok) return false;
  const code = body?.code || '';
  const msg = String(body?.message || body?.hint || '');
  if (code === 'PGRST205' || code === 'PGRST204' || code === '42P01' || code === '42703') return true;
  if (res.status === 404 || res.status === 400) {
    return /accounts|account_id|schema cache/i.test(msg) || /accounts|account_id/i.test(code);
  }
  return false;
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

async function fetchTable(config, name, query) {
  const root = restRoot(config);
  const res = await fetch(`${root}/rest/v1/${name}?${query}`, {
    headers: restHeaders(config),
  });
  if (!res.ok) {
    throw new Error(`Catalogue request failed (${res.status}).`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function loadFlatCatalogue(config, opts = {}) {
  const bookColumns = String(opts.bookColumns || '*').trim() || '*';
  const extra = String(opts.flatBookQuery || '')
    .split('&')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('&');
  const bookQuery = [
    `select=${bookColumns}`,
    extra,
    extra.includes('order=') ? '' : `order=${opts.bookOrder || 'title.asc'}`,
  ]
    .filter(Boolean)
    .join('&');
  const books = await fetchTable(config, 'books', bookQuery);
  const shelves = opts.includeShelves
    ? await fetchTable(config, 'shelves', 'select=*&order=sort_order.asc')
    : [];
  return { account: placeholderAccount(config), shelves, books };
}

/** @type {{ slug: string, account: { id: string | null, name: string, slug: string } } | null} */
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
  const body = await readJson(res);
  if (isMissingAccountSchema(res, body)) {
    const account = placeholderAccount(config);
    accountCache = { slug, account };
    return account;
  }
  if (!res.ok) {
    throw new Error(`Account lookup failed (${res.status}).`);
  }
  const rows = Array.isArray(body) ? body : [];
  const account = rows[0];
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
 * @param {{ bookColumns?: string, bookOrder?: string, includeShelves?: boolean, flatBookQuery?: string }} [opts]
 */
export async function loadAccountCatalogue(config, opts = {}) {
  const account = await loadAccount(config);
  if (!account.id) {
    return loadFlatCatalogue(config, opts);
  }
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
  const body = await readJson(res);
  if (!res.ok) {
    if (isMissingAccountSchema(res, body)) {
      return loadFlatCatalogue(config, opts);
    }
    throw new Error(`Catalogue request failed (${res.status}).`);
  }
  const row = Array.isArray(body) ? body[0] : body;
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
  if (!account.id) {
    return loadFlatCatalogue(config, { bookColumns, flatBookQuery: bookQuery });
  }
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
  const body = await readJson(res);
  if (!res.ok) {
    if (isMissingAccountSchema(res, body)) {
      return loadFlatCatalogue(config, { bookColumns, flatBookQuery: bookQuery });
    }
    throw new Error(`Catalogue lookup failed (${res.status}).`);
  }
  const row = Array.isArray(body) ? body[0] : body;
  return {
    account,
    books: Array.isArray(row?.books) ? row.books : [],
  };
}
