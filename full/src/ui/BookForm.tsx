import { useState, type FormEvent } from 'react';
import { uploadFile } from '../data/api';
import type { Availability, BookFormat, BookInput, Shelf } from '../types';

interface Props {
  initial: BookInput;
  shelves: Shelf[];
  title: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (input: BookInput) => Promise<void>;
}

function splitList(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BookForm({ initial, shelves, title, busy, onCancel, onSubmit }: Props) {
  const [form, setForm] = useState<BookInput>(initial);
  const [genresText, setGenresText] = useState((initial.genres || []).join(', '));
  const [tagsText, setTagsText] = useState((initial.tags || []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const set = <K extends keyof BookInput>(key: K, value: BookInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpload = async (
    file: File | undefined,
    kind: 'cover' | 'digital',
  ) => {
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const uploaded = await uploadFile(file, kind === 'cover' ? 'covers' : 'digital');
      if (kind === 'cover') {
        set('cover_url', uploaded.publicUrl);
      } else {
        set('digital_url', uploaded.publicUrl);
        set('digital_mime', uploaded.mime);
        set('is_digital', true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) {
      setError('Title and author are required.');
      return;
    }
    setError(null);
    await onSubmit({
      ...form,
      title: form.title.trim(),
      author: form.author.trim(),
      genres: splitList(genresText),
      tags: splitList(tagsText),
      keywords: form.keywords?.trim() || null,
      description: form.description?.trim() || null,
      publisher: form.publisher?.trim() || null,
      isbn: form.isbn?.trim() || null,
      cover_url: form.cover_url?.trim() || null,
      digital_url: form.digital_url?.trim() || null,
      digital_mime: form.digital_mime?.trim() || null,
      shelf_id: form.shelf_id || null,
    });
  };

  return (
    <aside className="panel form-panel panel-enter" aria-label={title}>
      <div className="panel-handle" aria-hidden="true" />
      <header className="panel-header">
        <div>
          <p className="eyebrow">Library</p>
          <h2>{title}</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close">
          ×
        </button>
      </header>

      <form className="book-form" onSubmit={submit}>
        <label>
          Title
          <input
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>
        <label>
          Author
          <input
            required
            value={form.author}
            onChange={(e) => set('author', e.target.value)}
          />
        </label>

        <div className="form-row">
          <label>
            Format
            <select
              value={form.format}
              onChange={(e) => set('format', e.target.value as BookFormat)}
            >
              <option value="paperback">Paperback</option>
              <option value="hardcover">Hardcover</option>
              <option value="ebook">Ebook</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Availability
            <select
              value={form.availability}
              onChange={(e) => set('availability', e.target.value as Availability)}
            >
              <option value="available">Available</option>
              <option value="on_loan">On loan</option>
              <option value="reserved">Reserved</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>
        </div>

        <label>
          Shelf
          <select
            value={form.shelf_id || ''}
            onChange={(e) => set('shelf_id', e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Genres (comma-separated)
          <input value={genresText} onChange={(e) => setGenresText(e.target.value)} />
        </label>
        <label>
          Tags (comma-separated)
          <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </label>
        <label>
          Keywords
          <input
            value={form.keywords || ''}
            onChange={(e) => set('keywords', e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </label>

        <div className="form-row">
          <label>
            Year
            <input
              type="number"
              value={form.year ?? ''}
              onChange={(e) =>
                set('year', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </label>
          <label>
            ISBN
            <input value={form.isbn || ''} onChange={(e) => set('isbn', e.target.value)} />
          </label>
        </div>

        <label>
          Publisher
          <input
            value={form.publisher || ''}
            onChange={(e) => set('publisher', e.target.value)}
          />
        </label>

        <fieldset className="media-fieldset">
          <legend>Cover</legend>
          <label>
            Cover image URL
            <input
              value={form.cover_url || ''}
              onChange={(e) => set('cover_url', e.target.value)}
            />
          </label>
          <label className="file-label">
            Or upload cover
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files?.[0], 'cover')}
            />
          </label>
          {uploading === 'cover' && <p className="muted">Uploading cover…</p>}
        </fieldset>

        <fieldset className="media-fieldset">
          <legend>Digital file</legend>
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.is_digital}
              onChange={(e) => set('is_digital', e.target.checked)}
            />
            Has digital copy
          </label>
          <label>
            Digital URL (PDF / EPUB)
            <input
              value={form.digital_url || ''}
              onChange={(e) => set('digital_url', e.target.value)}
            />
          </label>
          <label>
            MIME type
            <input
              value={form.digital_mime || ''}
              onChange={(e) => set('digital_mime', e.target.value)}
              placeholder="application/pdf"
            />
          </label>
          <label className="file-label">
            Or upload PDF / EPUB
            <input
              type="file"
              accept=".pdf,.epub,application/pdf,application/epub+zip"
              onChange={(e) => handleUpload(e.target.files?.[0], 'digital')}
            />
          </label>
          {uploading === 'digital' && <p className="muted">Uploading file…</p>}
        </fieldset>

        {error && <p className="form-error">{error}</p>}

        <div className="panel-actions end">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !!uploading}>
            {busy ? 'Saving…' : 'Save book'}
          </button>
        </div>
      </form>
    </aside>
  );
}
