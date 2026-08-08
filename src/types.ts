export type BookFormat = 'paperback' | 'hardcover' | 'ebook' | 'other';

export type SortOption = 'recent' | 'title' | 'author';

export interface Shelf {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
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
  created_at: string;
  updated_at: string;
}

export interface BookInput {
  title: string;
  author: string;
  format: BookFormat;
  is_digital: boolean;
  shelf_id: string | null;
  genres: string[];
  keywords: string | null;
}

export interface AppState {
  shelves: Shelf[];
  books: Book[];
  activeShelfId: string | null;
  query: string;
  sort: SortOption;
  panel: PanelState;
  status: string | null;
  loading: boolean;
}

export type PanelState =
  | { kind: 'none' }
  | { kind: 'add-book' }
  | { kind: 'edit-book'; bookId: string }
  | { kind: 'add-shelf' };
