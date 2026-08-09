import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bookToInput,
  createBook,
  deleteBook,
  emptyBookInput,
  fetchBooks,
  fetchShelves,
  updateBook,
} from './data/api';
import { BookshelfScene } from './scene/BookshelfScene';
import { shelfVisualKey } from './scene/shelfLayout';
import { useCamera } from './scene/useCamera';
import type { Book, BookInput, PanelMode, Shelf, VisualKey } from './types';
import { BookDetail } from './ui/BookDetail';
import { BookForm } from './ui/BookForm';
import { SearchDrawer, type BrowseMode } from './ui/SearchDrawer';
import { ShelfPanel } from './ui/ShelfPanel';
import { TopBar } from './ui/TopBar';

function matchesQuery(book: Book, q: string) {
  if (!q) return true;
  const hay = [
    book.title,
    book.author,
    book.keywords || '',
    book.publisher || '',
    book.isbn || '',
    ...(book.genres || []),
    ...(book.tags || []),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { camera, resetCamera } = useCamera(viewportRef);

  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelMode>({ kind: 'none' });
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('results');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setError(null);
    const [nextShelves, nextBooks] = await Promise.all([fetchShelves(), fetchBooks()]);
    setShelves(nextShelves);
    setBooks(nextBooks);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load library');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) {
      for (const g of book.genres || []) {
        if (g.trim()) set.add(g.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const activeBay: VisualKey | null =
    panel.kind === 'shelf' ? panel.visualKey : null;

  const shelfForBay = (key: VisualKey) =>
    shelves.find((s) => shelfVisualKey(s) === key) || null;

  const booksForBay = (key: VisualKey) => {
    const shelf = shelfForBay(key);
    if (!shelf) return [];
    return books.filter((b) => b.shelf_id === shelf.id);
  };

  const selectedBook =
    panel.kind === 'book' ? books.find((b) => b.id === panel.bookId) || null : null;

  const formInitial = useMemo(() => {
    if (panel.kind !== 'form') return emptyBookInput();
    if (panel.bookId) {
      const existing = books.find((b) => b.id === panel.bookId);
      if (existing) return bookToInput(existing);
    }
    return emptyBookInput(panel.shelfId ?? null);
  }, [panel, books]);

  const searchBooks = useMemo(() => {
    let list = books.filter((b) => matchesQuery(b, query));
    if (genre) {
      list = list.filter((b) => (b.genres || []).some((g) => g.toLowerCase() === genre.toLowerCase()));
    }
    if (browseMode === 'recent') {
      list = [...list].sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      );
      return list.slice(0, 24);
    }
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }, [books, query, genre, browseMode]);

  const openSearch = () => {
    setBrowseMode(query || genre ? 'results' : 'results');
    setPanel({ kind: 'search' });
  };

  const handleSave = async (input: BookInput) => {
    setSaving(true);
    setError(null);
    try {
      if (panel.kind === 'form' && panel.bookId) {
        const updated = await updateBook(panel.bookId, input);
        setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        setPanel({ kind: 'book', bookId: updated.id });
      } else {
        const created = await createBook(input);
        setBooks((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)));
        setPanel({ kind: 'book', bookId: created.id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this book from the library?')) return;
    try {
      await deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
      setPanel({ kind: 'none' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="app-shell">
      <TopBar
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          if (panel.kind !== 'search') setPanel({ kind: 'search' });
          setBrowseMode('results');
        }}
        onOpenSearch={openSearch}
        onAddBook={() => setPanel({ kind: 'form' })}
        onResetCamera={resetCamera}
      />

      <main className="stage">
        <div
          ref={viewportRef}
          className="viewport"
          style={{ touchAction: 'none', cursor: 'grab' }}
        >
          <div
            className="camera-layer"
            style={{
              transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
            }}
          >
            <BookshelfScene
              shelves={shelves}
              books={books}
              activeBay={activeBay}
              onBayClick={(key) => setPanel({ kind: 'shelf', visualKey: key })}
            />
          </div>
        </div>

        <div className="hint-bar">
          <span>Drag to pan · Scroll / pinch to zoom · Click a bay for its books</span>
          {loading && <span className="status">Opening the room…</span>}
          {error && <span className="status error">{error}</span>}
        </div>
      </main>

      {panel.kind !== 'none' && (
        <button
          type="button"
          className="scrim"
          aria-label="Close panel"
          onClick={() => setPanel({ kind: 'none' })}
        />
      )}

      {panel.kind === 'shelf' && (
        <ShelfPanel
          visualKey={panel.visualKey}
          shelf={shelfForBay(panel.visualKey)}
          books={booksForBay(panel.visualKey)}
          onClose={() => setPanel({ kind: 'none' })}
          onSelectBook={(id) => setPanel({ kind: 'book', bookId: id })}
          onAddBook={(shelfId) => setPanel({ kind: 'form', shelfId })}
        />
      )}

      {panel.kind === 'book' && selectedBook && (
        <BookDetail
          book={selectedBook}
          shelf={shelves.find((s) => s.id === selectedBook.shelf_id) || null}
          onClose={() => setPanel({ kind: 'none' })}
          onEdit={() => setPanel({ kind: 'form', bookId: selectedBook.id })}
          onDelete={() => handleDelete(selectedBook.id)}
        />
      )}

      {panel.kind === 'form' && (
        <BookForm
          key={panel.bookId || `new-${panel.shelfId || 'none'}`}
          title={panel.bookId ? 'Edit book' : 'Add book'}
          initial={formInitial}
          shelves={shelves}
          busy={saving}
          onCancel={() =>
            setPanel(
              panel.bookId
                ? { kind: 'book', bookId: panel.bookId }
                : { kind: 'none' },
            )
          }
          onSubmit={handleSave}
        />
      )}

      {panel.kind === 'search' && (
        <SearchDrawer
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            setBrowseMode('results');
          }}
          genre={genre}
          onGenreChange={setGenre}
          mode={browseMode}
          onModeChange={setBrowseMode}
          genres={genres}
          shelves={shelves}
          books={searchBooks}
          onClose={() => setPanel({ kind: 'none' })}
          onSelectBook={(id) => setPanel({ kind: 'book', bookId: id })}
          onSelectShelf={(key) => setPanel({ kind: 'shelf', visualKey: key })}
        />
      )}
    </div>
  );
}
