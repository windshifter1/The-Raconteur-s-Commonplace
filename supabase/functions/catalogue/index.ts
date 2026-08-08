import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { buildUrl, parseGenres, renderPage, slugify } from './html.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || anonKey;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function redirect(location: string): Response {
  return new Response('Redirecting…', {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
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
  const { data, error } = await supabase.from('books').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const actionBase = url.origin + url.pathname.replace(/\/$/, '');

  try {
    if (req.method === 'POST') {
      const form = await req.formData();
      const action = String(form.get('action') || '');

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
          return redirect(
            buildUrl(actionBase, anonKey, {
              view: 'catalogue',
              status: 'Book added.',
            }),
          );
        }
        const id = String(form.get('id') || '');
        const { error } = await supabase.from('books').update(payload).eq('id', id);
        if (error) throw error;
        return redirect(
          buildUrl(actionBase, anonKey, {
            view: 'catalogue',
            status: 'Book updated.',
          }),
        );
      }

      if (action === 'delete-book') {
        const id = String(form.get('id') || '');
        const { error } = await supabase.from('books').delete().eq('id', id);
        if (error) throw error;
        return redirect(
          buildUrl(actionBase, anonKey, {
            view: 'catalogue',
            status: 'Book deleted.',
          }),
        );
      }

      if (action === 'create-shelf') {
        const name = String(form.get('name') || '').trim();
        if (!name) throw new Error('Shelf name is required.');
        const { data: existing } = await supabase
          .from('shelves')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1);
        const sort_order = ((existing && existing[0] && existing[0].sort_order) || 0) + 1;
        const { error } = await supabase.from('shelves').insert({
          name,
          slug: slugify(name),
          sort_order,
        });
        if (error) throw error;
        return redirect(
          buildUrl(actionBase, anonKey, {
            view: 'catalogue',
            status: 'Shelf added.',
          }),
        );
      }

      throw new Error('Unknown action.');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return htmlResponse('<!DOCTYPE html><html><body><p>Method not allowed.</p></body></html>', 405);
    }

    const view = url.searchParams.get('view') || 'catalogue';
    const shelfId = url.searchParams.get('shelf');
    const query = url.searchParams.get('q') || '';
    const sort = url.searchParams.get('sort') || 'recent';
    const status = url.searchParams.get('status');
    const id = url.searchParams.get('id');

    const { shelves, books } = await loadData();
    let editBook = null;
    if (id && (view === 'edit-book' || view === 'confirm-delete' || view === 'book')) {
      editBook = await findBook(id);
      if (!editBook) {
        return htmlResponse(
          renderPage({
            shelves,
            books,
            actionBase,
            apiKey: anonKey,
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
        actionBase,
        apiKey: anonKey,
        view,
        shelfId,
        query,
        sort,
        status,
        editBook,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    try {
      const { shelves, books } = await loadData();
      return htmlResponse(
        renderPage({
          shelves,
          books,
          actionBase,
          apiKey: anonKey,
          view: 'catalogue',
          status: message,
        }),
        500,
      );
    } catch {
      return htmlResponse(
        `<!DOCTYPE html><html><body><p>${message}</p></body></html>`,
        500,
      );
    }
  }
});
