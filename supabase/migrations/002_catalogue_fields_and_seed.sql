-- Catalogue fields for book detail views
alter table public.books
  add column if not exists description text,
  add column if not exists availability text not null default 'available'
    check (availability in ('available', 'on_loan', 'reserved', 'unavailable')),
  add column if not exists year integer,
  add column if not exists publisher text,
  add column if not exists isbn text;

-- Reset demo data to a single shelf and book
truncate table public.books restart identity cascade;
truncate table public.shelves restart identity cascade;

insert into public.shelves (name, slug, sort_order)
values ('Shelf A1', 'shelf-a1', 1);

insert into public.books (
  title,
  author,
  format,
  is_digital,
  shelf_id,
  genres,
  keywords,
  description,
  availability,
  year,
  publisher
)
select
  'A Book',
  'A. Author',
  'paperback',
  false,
  s.id,
  array['fiction'],
  'placeholder, sample',
  'A simple placeholder title kept in the catalogue while the real collection is gathered.',
  'available',
  2024,
  'Commonplace Press'
from public.shelves s
where s.slug = 'shelf-a1';
