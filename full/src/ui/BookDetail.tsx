import type { Book, Shelf } from '../types';

interface Props {
  book: Book;
  shelf: Shelf | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function isPdf(book: Book) {
  const mime = (book.digital_mime || '').toLowerCase();
  const url = (book.digital_url || '').toLowerCase();
  return mime.includes('pdf') || url.endsWith('.pdf');
}

export function BookDetail({ book, shelf, onClose, onEdit, onDelete }: Props) {
  const showEmbed = Boolean(book.digital_url && isPdf(book));

  return (
    <aside className="panel detail-panel panel-enter" aria-label={`Book ${book.title}`}>
      <div className="panel-handle" aria-hidden="true" />
      <header className="panel-header">
        <div>
          <p className="eyebrow">{book.format}{book.is_digital ? ' · digital' : ''}</p>
          <h2>{book.title}</h2>
          <p className="author">{book.author}</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {book.cover_url && (
        <div className="cover-wrap">
          <img src={book.cover_url} alt="" className="cover-image" />
        </div>
      )}

      <div className="detail-meta">
        {shelf && (
          <p>
            <span>Shelf</span> {shelf.name}
          </p>
        )}
        <p>
          <span>Availability</span> {book.availability.replace('_', ' ')}
        </p>
        {book.year != null && (
          <p>
            <span>Year</span> {book.year}
          </p>
        )}
        {book.publisher && (
          <p>
            <span>Publisher</span> {book.publisher}
          </p>
        )}
        {book.isbn && (
          <p>
            <span>ISBN</span> {book.isbn}
          </p>
        )}
      </div>

      {book.genres?.length > 0 && (
        <div className="chip-row">
          {book.genres.map((g) => (
            <span key={g} className="chip">
              {g}
            </span>
          ))}
        </div>
      )}

      {book.tags?.length > 0 && (
        <div className="chip-row soft">
          {book.tags.map((t) => (
            <span key={t} className="chip soft">
              {t}
            </span>
          ))}
        </div>
      )}

      {book.description && <p className="description">{book.description}</p>}
      {book.keywords && <p className="muted keywords">Keywords: {book.keywords}</p>}

      {book.digital_url && (
        <div className="digital-block">
          <a className="btn primary" href={book.digital_url} target="_blank" rel="noreferrer">
            Open digital file
          </a>
          {showEmbed && (
            <iframe
              className="pdf-frame"
              title={`PDF — ${book.title}`}
              src={book.digital_url}
            />
          )}
        </div>
      )}

      <div className="panel-actions end">
        <button type="button" className="btn ghost" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </aside>
  );
}
