import type { Book, Shelf, VisualKey } from '../types';
import { BAY_BY_KEY } from '../scene/shelfLayout';

interface Props {
  visualKey: VisualKey;
  shelf: Shelf | null;
  books: Book[];
  onClose: () => void;
  onSelectBook: (id: string) => void;
  onAddBook: (shelfId: string | null) => void;
}

export function ShelfPanel({
  visualKey,
  shelf,
  books,
  onClose,
  onSelectBook,
  onAddBook,
}: Props) {
  const bay = BAY_BY_KEY[visualKey];
  const title = shelf?.name || bay?.label || visualKey;

  return (
    <aside className="panel shelf-panel panel-enter" aria-label={`Shelf ${title}`}>
      <div className="panel-handle" aria-hidden="true" />
      <header className="panel-header">
        <div>
          <p className="eyebrow">Shelf</p>
          <h2>{title}</h2>
          <p className="muted">
            {books.length === 0
              ? 'Empty for now'
              : `${books.length} ${books.length === 1 ? 'volume' : 'volumes'}`}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="panel-actions">
        <button
          type="button"
          className="btn solid"
          onClick={() => onAddBook(shelf?.id ?? null)}
        >
          Place a book here
        </button>
      </div>

      <ul className="book-list">
        {books.length === 0 && (
          <li className="empty-state">
            This shelf is clear. Add a book whenever you are ready.
          </li>
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
    </aside>
  );
}
