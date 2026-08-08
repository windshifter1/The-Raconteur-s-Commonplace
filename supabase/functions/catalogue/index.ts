// Kobo plain-HTML catalogue — server-rendered, zero client JS.
// Supabase rewrites GET text/html → text/plain, so all page views use POST.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { parseGenres, renderPage, slugify } from './html.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || anonKey;
const pagesHome =
  Deno.env.get('PAGES_HOME') ||
  'https://windshifter1.github.io/The-Raconteur-s-Commonplace/';

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

async function loadData() {
  const shelvesRes = await supabase
    .from('shelves')
    .select('*')
    .order('sort_order', { ascending: true });
  if (shelvesRes.error) throw shelvesRes.error;

  const booksRes = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });
  if (booksRes.error) throw booksRes.error;

  return {
    shelves: shelvesRes.data || [],
    books: booksRes.data || [],
  };
}

async function findBook(id: string) {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function renderView(opts: {
  actionBase: string;
  view: string;
  shelfId?: string | null;
  query?: string;
  sort?: string;
  status?: string | null;
  id?: string | null;
  httpStatus?: number;
}) {
  const { shelves, books } = await loadData();
  let editBook = null;
  const view = opts.view || 'catalogue';
  const id = opts.id || null;
  if (id && (view === 'edit-book' || view === 'confirm-delete' || view === 'book')) {
    editBook = await findBook(id);
    if (!editBook) {
      return htmlResponse(
        renderPage({
          shelves,
          books,
          actionBase: opts.actionBase,
          apiKey: anonKey,
          pagesHome,
          view: 'catalogue',
          status: 'That book was not found.',
        }),
        404,
      );
    }
  }

  return htmlResponse(
    renderPage({
      shelves,
      books,
      actionBase: opts.actionBase,
      apiKey: anonKey,
      pagesHome,
      view,
      shelfId: opts.shelfId || null,
      query: opts.query || '',
      sort: opts.sort || 'recent',
      status: opts.status || null,
      editBook,
    }),
    opts.httpStatus || 200,
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const actionBase = url.origin + url.pathname.replace(/\/$/, '');

  try {
    // GET cannot serve HTML on Supabase (forced to text/plain).
    // Send people to GitHub Pages, which renders correctly.
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
      return await renderView({
        actionBase,
        view: String(form.get('view') || 'catalogue'),
        shelfId: String(form.get('shelf') || '') || null,
        query: String(form.get('q') || ''),
        sort: String(form.get('sort') || 'recent'),
        id: String(form.get('id') || '') || null,
        status: String(form.get('status') || '') || null,
      });
    }

    if (action === 'create-book' || action === 'update-book') {
      const payload = {
        title: String(form.get('title') || '').trim(),
        author: String(form.get('author') || '').trim(),
        format: String(form.get('format') || 'paperback'),
        is_digital: form.get('is_digital') === '1',
        shelf_id: String(form.get('shelf_id') || '') || null,
        genres: parseGenres(form.get('genres')),
        keywords: String(form.get('keywords') || '').trim() || null,
      };
      if (!payload.title || !payload.author) {
        throw new Error('Title and author are required.');
      }
      if (action === 'create-book') {
        const { error } = await supabase.from('books').insert(payload);
        if (error) throw error;
        return await renderView({
          actionBase,
          view: 'catalogue',
          status: 'Book added.',
        });
      }
      const id = String(form.get('id') || '');
      const { error } = await supabase.from('books').update(payload).eq('id', id);
      if (error) throw error;
      return await renderView({
        actionBase,
        view: 'catalogue',
        status: 'Book updated.',
      });
    }

    if (action === 'delete-book') {
      const id = String(form.get('id') || '');
      const { error } = await supabase.from('books').delete().eq('id', id);
      if (error) throw error;
      return await renderView({
        actionBase,
        view: 'catalogue',
        status: 'Book deleted.',
      });
    }

    if (action === 'create-shelf') {
      const name = String(form.get('name') || '').trim();
      if (!name) throw new Error('Shelf name is required.');
      const { data: existing } = await supabase
        .from('shelves')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);
      const sort_order =
        ((existing && existing[0] && existing[0].sort_order) || 0) + 1;
      const { error } = await supabase.from('shelves').insert({
        name,
        slug: slugify(name),
        sort_order,
      });
      if (error) throw error;
      return await renderView({
        actionBase,
        view: 'catalogue',
        status: 'Shelf added.',
      });
    }

    throw new Error('Unknown action.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    try {
      return await renderView({
        actionBase,
        view: 'catalogue',
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
