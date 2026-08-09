-- Full Experience: media fields, tags, visual shelf keys, storage, 3x5 bay seed

alter table public.books
  add column if not exists cover_url text,
  add column if not exists digital_url text,
  add column if not exists digital_mime text,
  add column if not exists tags text[] not null default '{}';

alter table public.shelves
  add column if not exists visual_key text;

-- Ensure one shelf per visual bay (3 columns x 5 rows from the vector layout)
create unique index if not exists shelves_visual_key_uidx
  on public.shelves (visual_key)
  where visual_key is not null;

-- Rebuild shelves as the digital twin bays (demo catalogue is small)
truncate table public.books restart identity cascade;
truncate table public.shelves restart identity cascade;

insert into public.shelves (name, slug, sort_order, visual_key) values
  ('Bay R1C1', 'r1c1', 1, 'r1c1'),
  ('Bay R1C2', 'r1c2', 2, 'r1c2'),
  ('Bay R1C3', 'r1c3', 3, 'r1c3'),
  ('Bay R2C1', 'r2c1', 4, 'r2c1'),
  ('Bay R2C2', 'r2c2', 5, 'r2c2'),
  ('Bay R2C3', 'r2c3', 6, 'r2c3'),
  ('Bay R3C1', 'r3c1', 7, 'r3c1'),
  ('Bay R3C2', 'r3c2', 8, 'r3c2'),
  ('Bay R3C3', 'r3c3', 9, 'r3c3'),
  ('Bay R4C1', 'r4c1', 10, 'r4c1'),
  ('Bay R4C2', 'r4c2', 11, 'r4c2'),
  ('Bay R4C3', 'r4c3', 12, 'r4c3'),
  ('Bay R5C1', 'r5c1', 13, 'r5c1'),
  ('Bay R5C2', 'r5c2', 14, 'r5c2'),
  ('Bay R5C3', 'r5c3', 15, 'r5c3');

insert into public.books (
  title, author, format, is_digital, shelf_id, genres, keywords,
  description, availability, year, publisher, tags
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
  'Commonplace Press',
  array['sample']
from public.shelves s
where s.visual_key = 'r5c2';

-- Public media bucket for covers / PDF / EPUB
insert into storage.buckets (id, name, public)
values ('library-media', 'library-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read library media" on storage.objects;
create policy "Public read library media"
  on storage.objects for select
  using (bucket_id = 'library-media');

drop policy if exists "Public upload library media" on storage.objects;
create policy "Public upload library media"
  on storage.objects for insert
  with check (bucket_id = 'library-media');

drop policy if exists "Public update library media" on storage.objects;
create policy "Public update library media"
  on storage.objects for update
  using (bucket_id = 'library-media')
  with check (bucket_id = 'library-media');

drop policy if exists "Public delete library media" on storage.objects;
create policy "Public delete library media"
  on storage.objects for delete
  using (bucket_id = 'library-media');
