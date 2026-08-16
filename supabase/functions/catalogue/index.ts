// Kobo plain-HTML catalogue — server-rendered, zero client JS.
// Supabase rewrites GET text/html → text/plain, so all page views use POST.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { catalogueEndpoint, parseGenres, renderPage, slugify } from './html.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || anonKey;
const pagesHome =
  Deno.env.get('PAGES_HOME') ||
  'https://windshifter1.github.io/The-Raconteur-s-Commonplace/';
const ACCOUNT_SLUG = (Deno.env.get('CATALOGUE_ACCOUNT_SLUG') || 'yusuf').trim().toLowerCase() || 'yusuf';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function htmlResponse(body: string, status = 200): Response {
  const headers = new Headers();
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(new Blob([body], { type: 'text/html; charset=utf-8' }), {
    status,
    headers,
  });
}

function redirect(location: string): Response {
  const headers = new Headers();
  headers.set('location', location);
  headers.set('cache-control', 'no-store');
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response('Redirecting to ' + location, { status: 303, headers });
}

async function loadAccount() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, slug')
    .eq('slug', ACCOUNT_SLUG)
    .maybeSingle();
  if (error) {
    if (/accounts|schema cache|PGRST205|42P01/i.test(error.message || '')) return null;
    throw error;
  }
  return data;
}

async function loadData() {
  const account = await loadAccount();
  if (!account) {
    const shelvesRes = await supabase.from('shelves').select('*').order('sort_order', { ascending: true });
    if (shelvesRes.error) throw shelvesRes.error;
    const booksRes = await supabase.from('books').select('*').order('title', { ascending: true });
    if (booksRes.error) throw booksRes.error;
    return { account: null, shelves: shelvesRes.data || [], books: booksRes.data || [] };
  }
  const { data, error } = await supabase
    .from('accounts')
    .select('shelves(*), books(*)')
    .eq('id', account.id)
    .maybeSingle();
  if (error) throw error;
  const shelves = [...(data?.shelves || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
  );
  const books = [...(data?.books || [])].sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || '')),
  );
  return { account, shelves, books };
}

async function findBook(id: string, accountId: string | null) {
  if (!id) return null;
  let query = supabase.from('books').select('*').eq('id', id);
  if (accountId) query = query.eq('account_id', accountId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function renderView(opts: {
  actionBase: string;
  view: string;
  query?: string;
  letter?: string;
  genre?: string;
  sort?: string;
  searched?: boolean;
  status?: string | null;
  id?: string | null;
  httpStatus?: number;
}) {
  const { account, shelves, books } = await loadData();
  const view = opts.view || 'home';
  let editBook = null;

  if (view === 'book') {
    editBook = await findBook(opts.id || '', account?.id || null);
  }

  return htmlResponse(
    renderPage({
      shelves,
      books,
      actionBase: opts.actionBase,
      apiKey: anonKey,
      pagesHome,
      view,
      query: opts.query || '',
      letter: opts.letter || '',
      genre: opts.genre || '',
      sort: opts.sort || 'title',
      searched: !!opts.searched,
      status: opts.status || null,
      editBook,
    }),
    opts.httpStatus || 200,
  );
}

Deno.serve(async (req) => {
  // Never derive the form action from the request path — extra segments /
  // trailing slashes make Supabase return {"error":"requested path is invalid"}.
  const actionBase = catalogueEndpoint(supabaseUrl);

  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return redirect(pagesHome);
    }

    if (req.method !== 'POST') {
      return htmlResponse(
        '<!DOCTYPE html><html><body><p>Method not allowed.</p></body></html>',
        405,
      );
    }

    const form = await req.formData();
    const action = String(form.get('action') || 'view');

    if (action === 'view') {
      const view = String(form.get('view') || 'home');
      return await renderView({
        actionBase,
        view,
        query: String(form.get('q') || ''),
        letter: String(form.get('letter') || ''),
        genre: String(form.get('genre') || ''),
        sort: String(form.get('sort') || 'title'),
        searched:
          form.get('searched') === '1' ||
          (view === 'find' && String(form.get('q') || '').trim() !== ''),
        id: String(form.get('id') || '') || null,
        status: String(form.get('status') || '') || null,
      });
    }

    // Lightweight manage actions kept for catalogue upkeep
    if (action === 'create-book' || action === 'update-book') {
      const payload = {
        title: String(form.get('title') || '').trim(),
        author: String(form.get('author') || '').trim(),
        format: String(form.get('format') || 'paperback'),
        is_digital: form.get('is_digital') === '1',
        shelf_id: String(form.get('shelf_id') || '') || null,
        genres: parseGenres(form.get('genres')),
        keywords: String(form.get('keywords') || '').trim() || null,
        description: String(form.get('description') || '').trim() || null,
        availability: String(form.get('availability') || 'available'),
        year: String(form.get('year') || '').trim()
          ? Number(form.get('year'))
          : null,
        publisher: String(form.get('publisher') || '').trim() || null,
        isbn: String(form.get('isbn') || '').trim() || null,
      };
      if (!payload.title || !payload.author) {
        return await renderView({
          actionBase,
          view: 'home',
          status: 'Title and author are required.',
          httpStatus: 400,
        });
      }
      if (action === 'create-book') {
        const account = await loadAccount();
        const row = account ? { ...payload, account_id: account.id } : payload;
        const { error } = await supabase.from('books').insert(row);
        if (error) throw error;
        return await renderView({
          actionBase,
          view: 'browse',
          status: 'Book added.',
        });
      }
      const id = String(form.get('id') || '');
      const account = await loadAccount();
      let update = supabase.from('books').update(payload).eq('id', id);
      if (account) update = update.eq('account_id', account.id);
      const { error } = await update;
      if (error) throw error;
      return await renderView({
        actionBase,
        view: 'book',
        id,
        status: 'Book updated.',
      });
    }

    if (action === 'delete-book') {
      const id = String(form.get('id') || '');
      const account = await loadAccount();
      let del = supabase.from('books').delete().eq('id', id);
      if (account) del = del.eq('account_id', account.id);
      const { error } = await del;
      if (error) throw error;
      return await renderView({
        actionBase,
        view: 'browse',
        status: 'Book deleted.',
      });
    }

    if (action === 'create-shelf') {
      const name = String(form.get('name') || '').trim();
      if (!name) {
        return await renderView({
          actionBase,
          view: 'home',
          status: 'Shelf name is required.',
          httpStatus: 400,
        });
      }
      const account = await loadAccount();
      let existingQuery = supabase
        .from('shelves')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);
      if (account) existingQuery = existingQuery.eq('account_id', account.id);
      const { data: existing } = await existingQuery;
      const sort_order =
        ((existing && existing[0] && existing[0].sort_order) || 0) + 1;
      const { error } = await supabase.from('shelves').insert({
        name,
        slug: slugify(name),
        sort_order,
        ...(account ? { account_id: account.id } : {}),
      });
      if (error) throw error;
      return await renderView({
        actionBase,
        view: 'browse',
        status: 'Shelf added.',
      });
    }

    return await renderView({
      actionBase,
      view: 'home',
        status: 'Unknown action.',
      httpStatus: 400,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    try {
      return await renderView({
        actionBase,
        view: 'home',
        status: message,
        httpStatus: 500,
      });
    } catch {
      return htmlResponse(
        `<!DOCTYPE html><html><body><p>${message}</p></body></html>`,
        500,
      );
    }
  }
});
