-- Tenant accounts so catalogue data is database → account → books/shelves.
-- Current public library belongs to Yusuf. Later accounts can hold their own rows
-- without colliding on shelf slugs or visual bays.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

insert into public.accounts (name, slug)
values ('Yusuf', 'yusuf')
on conflict (slug) do update set name = excluded.name;

alter table public.books
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

alter table public.shelves
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

update public.books
set account_id = (select id from public.accounts where slug = 'yusuf')
where account_id is null;

update public.shelves
set account_id = (select id from public.accounts where slug = 'yusuf')
where account_id is null;

alter table public.books alter column account_id set not null;
alter table public.shelves alter column account_id set not null;

create index if not exists books_account_id_idx on public.books (account_id);
create index if not exists books_account_isbn_idx on public.books (account_id, isbn);
create index if not exists shelves_account_id_idx on public.shelves (account_id);

alter table public.shelves drop constraint if exists shelves_name_key;
alter table public.shelves drop constraint if exists shelves_slug_key;
drop index if exists public.shelves_visual_key_uidx;

create unique index if not exists shelves_account_slug_uidx
  on public.shelves (account_id, slug);
create unique index if not exists shelves_account_name_uidx
  on public.shelves (account_id, name);
create unique index if not exists shelves_account_visual_key_uidx
  on public.shelves (account_id, visual_key)
  where visual_key is not null;

create or replace function public.set_default_account_id()
returns trigger
language plpgsql
as $$
begin
  if new.account_id is null then
    select id into new.account_id
    from public.accounts
    where slug = 'yusuf'
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists books_default_account on public.books;
create trigger books_default_account
before insert on public.books
for each row execute function public.set_default_account_id();

drop trigger if exists shelves_default_account on public.shelves;
create trigger shelves_default_account
before insert on public.shelves
for each row execute function public.set_default_account_id();

alter table public.accounts enable row level security;

drop policy if exists "Public read accounts" on public.accounts;
create policy "Public read accounts" on public.accounts for select using (true);
