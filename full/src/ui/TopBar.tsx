interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  onOpenSearch: () => void;
  onAddBook: () => void;
  onResetCamera: () => void;
}

const KOBO_HREF = import.meta.env.BASE_URL.includes('/full')
  ? '../'
  : '/The-Raconteur-s-Commonplace/';

export function TopBar({
  query,
  onQueryChange,
  onOpenSearch,
  onAddBook,
  onResetCamera,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <p className="brand-mark">The Raconteur&apos;s Commonplace</p>
        <p className="brand-sub">Full Experience</p>
      </div>

      <div className="topbar-tools">
        <label className="search-field">
          <span className="sr-only">Search library</span>
          <input
            type="search"
            placeholder="Search title, author, genre…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={onOpenSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpenSearch();
            }}
          />
        </label>
        <button type="button" className="btn ghost" onClick={onOpenSearch}>
          Browse
        </button>
        <button type="button" className="btn primary" onClick={onAddBook}>
          Add book
        </button>
        <button type="button" className="btn ghost" onClick={onResetCamera} title="Reset view">
          Recenter
        </button>
        <a className="btn link" href={KOBO_HREF}>
          Kobo catalogue
        </a>
      </div>
    </header>
  );
}
