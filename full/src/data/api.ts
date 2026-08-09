import { MEDIA_BUCKET, supabase } from '../lib/supabase';
import type { Book, BookInput, Shelf } from '../types';

function assertOk<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('No data returned');
  return data;
}

export async function fetchShelves(): Promise<Shelf[]> {
  const { data, error } = await supabase
    .from('shelves')
    .select('*')
    .order('sort_order', { ascending: true });
  return assertOk(data, error) as Shelf[];
}

export async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('title', { ascending: true });
  return assertOk(data, error) as Book[];
}

export async function createBook(input: BookInput): Promise<Book> {
  const { data, error } = await supabase
    .from('books')
    .insert(input)
    .select('*')
    .single();
  return assertOk(data, error) as Book;
}

export async function updateBook(id: string, input: Partial<BookInput>): Promise<Book> {
  const { data, error } = await supabase
    .from('books')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  return assertOk(data, error) as Book;
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await supabase.from('books').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadFile(
  file: File,
  folder: 'covers' | 'digital' = 'covers',
): Promise<{ publicUrl: string; mime: string; path: string }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return {
    publicUrl: data.publicUrl,
    mime: file.type || 'application/octet-stream',
    path,
  };
}

export function emptyBookInput(shelfId: string | null = null): BookInput {
  return {
    title: '',
    author: '',
    format: 'paperback',
    is_digital: false,
    shelf_id: shelfId,
    genres: [],
    keywords: null,
    description: null,
    availability: 'available',
    year: null,
    publisher: null,
    isbn: null,
    cover_url: null,
    digital_url: null,
    digital_mime: null,
    tags: [],
  };
}

export function bookToInput(book: Book): BookInput {
  return {
    title: book.title,
    author: book.author,
    format: book.format,
    is_digital: book.is_digital,
    shelf_id: book.shelf_id,
    genres: book.genres || [],
    keywords: book.keywords,
    description: book.description,
    availability: book.availability,
    year: book.year,
    publisher: book.publisher,
    isbn: book.isbn,
    cover_url: book.cover_url,
    digital_url: book.digital_url,
    digital_mime: book.digital_mime,
    tags: book.tags || [],
  };
}
