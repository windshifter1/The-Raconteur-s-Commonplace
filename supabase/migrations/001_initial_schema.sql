-- The Raconteur's Commonplace — initial schema
-- Run in Supabase SQL Editor if needed

create extension if not exists "pgcrypto";

create table if not exists public.shelves (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  format text not null check (format in ('paperback', 'hardcover', 'ebook', 'other')),
  is_digital boolean not null default false,
  shelf_id uuid references public.shelves(id) on delete set null,
  genres text[] not null default '{}',
  keywords text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_shelf_id_idx on public.books(shelf_id);
create index if not exists books_created_at_idx on public.books(created_at desc);
create index if not exists shelves_sort_order_idx on public.shelves(sort_order);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
before update on public.books
for each row execute function public.set_updated_at();

alter table public.shelves enable row level security;
alter table public.books enable row level security;

create policy "Public read shelves" on public.shelves for select using (true);
create policy "Public read books" on public.books for select using (true);
create policy "Public insert shelves" on public.shelves for insert with check (true);
create policy "Public update shelves" on public.shelves for update using (true) with check (true);
create policy "Public delete shelves" on public.shelves for delete using (true);
create policy "Public insert books" on public.books for insert with check (true);
create policy "Public update books" on public.books for update using (true) with check (true);
create policy "Public delete books" on public.books for delete using (true);
