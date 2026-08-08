import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Book, BookInput, Shelf } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigError =
  !url || !key
    ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in GitHub Actions secrets/variables and redeploy.'
    : null;

export const supabase: SupabaseClient | null = supabaseConfigError
  ? null
  : createClient(url, key);

function client(): SupabaseClient {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase not configured');
  return supabase;
}

export async function fetchShelves(): Promise<Shelf[]> {
  const { data, error } = await client()
    .from('shelves')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await client()
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createBook(input: BookInput): Promise<Book> {
  const { data, error } = await client()
    .from('books')
    .insert(input)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateBook(id: string, input: BookInput): Promise<Book> {
  const { data, error } = await client()
    .from('books')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await client().from('books').delete().eq('id', id);
  if (error) throw error;
}

export async function createShelf(name: string): Promise<Shelf> {
  const slug = slugify(name);
  const { data: existing } = await client()
    .from('shelves')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  const sort_order = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await client()
    .from('shelves')
    .insert({ name, slug, sort_order })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
