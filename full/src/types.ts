export type BookFormat = 'paperback' | 'hardcover' | 'ebook' | 'other';
export type Availability = 'available' | 'on_loan' | 'reserved' | 'unavailable';

export type VisualKey =
  | 'r1c1'
  | 'r1c2'
  | 'r1c3'
  | 'r2c1'
  | 'r2c2'
  | 'r2c3'
  | 'r3c1'
  | 'r3c2'
  | 'r3c3'
  | 'r4c1'
  | 'r4c2'
  | 'r4c3'
  | 'r5c1'
  | 'r5c2'
  | 'r5c3';

export interface Shelf {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  visual_key: VisualKey | string | null;
  created_at: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  is_digital: boolean;
  shelf_id: string | null;
  genres: string[];
  keywords: string | null;
  description: string | null;
  availability: Availability;
  year: number | null;
  publisher: string | null;
  isbn: string | null;
  cover_url: string | null;
  digital_url: string | null;
  digital_mime: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type BookInput = Omit<Book, 'id' | 'created_at' | 'updated_at'>;

export type PanelMode =
  | { kind: 'none' }
  | { kind: 'shelf'; visualKey: VisualKey }
  | { kind: 'book'; bookId: string }
  | { kind: 'form'; bookId?: string; shelfId?: string | null }
  | { kind: 'search' };
