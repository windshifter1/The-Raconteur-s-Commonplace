import type { Book, Shelf, VisualKey } from '../types';
import { shelfVisualKey } from '../scene/shelfLayout';

export type BrowseMode = 'results' | 'genre' | 'shelf' | 'recent';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  genre: string;
  onGenreChange: (value: string) => void;
  mode: BrowseMode;
  onModeChange: (mode: BrowseMode) => void;
  genres: string[];
  shelves: Shelf[];
  books: Book[];
  onClose: () => void;
  onSelectBook: (id: string) => void;
  onSelectShelf: (key: VisualKey) => void;
}

export function SearchDrawer({
  query,
  onQueryChange,
  genre,
  onGenreChange,
  mode,
  onModeChange,
  genres,
  shelves,
  books,
  onClose,
  onSelectBook,
  onSelectShelf,
}: Props) {
  return (
    <aside className="panel search-panel panel-enter" aria-label="Search library">
      <div className="panel-handle" aria-hidden="true" />
      <header className="panel-header">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h2>Browse</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <label className="search-field block">
        <span className="sr-only">Search</span>
        <input
          type="search"
          placeholder="Title, author, genre, tags…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          autoFocus
        />
      </label>

      <div className="mode-tabs" role="tablist">
        {(
          [
            ['results', 'Results'],
            ['genre', 'Genres'],
            ['shelf', 'Shelves'],
            ['recent', 'Recent'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={`mode-tab${mode === id ? ' is-active' : ''}`}
            onClick={() => onModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'genre' && (
        <div className="chip-row wrap">
          <button
            type="button"
            className={`chip button${genre === '' ? ' is-active' : ''}`}
            onClick={() => onGenreChange('')}
          >
            All
          </button>
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              className={`chip button${genre === g ? ' is-active' : ''}`}
              onClick={() => {
                onGenreChange(g);
                onModeChange('results');
              }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {mode === 'shelf' && (
        <ul className="book-list">
          {shelves.map((shelf) => {
            const key = shelfVisualKey(shelf);
            const count = books.filter((b) => b.shelf_id === shelf.id).length;
            return (
              <li key={shelf.id}>
                <button
                  type="button"
                  className="book-row"
                  disabled={!key}
                  onClick={() => key && onSelectShelf(key)}
                >
                  <span className="book-row-title">{shelf.name}</span>
                  <span className="book-row-meta">
                    {count} {count === 1 ? 'book' : 'books'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(mode === 'results' || mode === 'recent') && (
        <ul className="book-list">
          {books.length === 0 && (
            <li className="empty-state">No books found.</li>
          )}
          {books.map((book) => (
            <li key={book.id}>
              <button type="button" className="book-row" onClick={() => onSelectBook(book.id)}>
                <span className="book-row-title">{book.title}</span>
                <span className="book-row-meta">
                  {book.author}
                  {book.genres?.[0] ? ` · ${book.genres[0]}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
