begin;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 3000),
  price numeric(10,2) not null check (price >= 0),
  category text not null check (category in ('electronics','furniture','home-garden','clothing','sports','books','toys-games','other')),
  seller_email text not null check (char_length(seller_email) <= 254 and seller_email like '%@%'),
  image_path text not null check (image_path ~ '^[0-9a-f-]{36}/photo\.webp$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_email text not null check (char_length(buyer_email) <= 254 and buyer_email like '%@%'),
  seller_email text not null check (char_length(seller_email) <= 254 and seller_email like '%@%'),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table if not exists public.request_limits (
  bucket text primary key,
  window_started timestamptz not null,
  hits integer not null
);
create index if not exists listings_category_created_idx on public.listings(category, created_at desc);
create index if not exists listings_created_idx on public.listings(created_at desc, id desc);
create index if not exists messages_listing_idx on public.messages(listing_id);

alter table public.listings enable row level security;
alter table public.messages enable row level security;
alter table public.request_limits enable row level security;
revoke all on public.listings, public.messages, public.request_limits from public, anon, authenticated;
grant select on public.listings to anon, authenticated;
grant all on public.listings, public.messages, public.request_limits to service_role;
create policy "Public listings are readable" on public.listings for select to anon, authenticated using (true);
-- There are intentionally no public message or mutation policies.

create or replace function public.browse_listings(category_filter text default '', search_term text default '', page_offset integer default 0, page_size integer default 12)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (
    select id,title,description,price,category,seller_email,image_path,created_at
    from public.listings
    where (category_filter = '' or category = category_filter)
      and (search_term = '' or position(lower(search_term) in lower(title || ' ' || description)) > 0)
  ), selected as (
    select * from filtered order by created_at desc, id desc limit least(greatest(page_size,1),24) offset greatest(page_offset,0)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(selected order by created_at desc,id desc) from selected),'[]'::jsonb),'count',(select count(*) from filtered));
$$;
revoke all on function public.browse_listings(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.browse_listings(text,text,integer,integer) to service_role;

create or replace function public.consume_rate_limit(bucket_key text, maximum_hits integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_hits integer;
begin
  delete from public.request_limits where window_started < now() - interval '2 hours';
  insert into public.request_limits(bucket,window_started,hits)
    values(bucket_key,date_trunc('hour',now()),1)
  on conflict(bucket) do update set
    hits = case when request_limits.window_started = date_trunc('hour',now()) then request_limits.hits + 1 else 1 end,
    window_started = date_trunc('hour',now())
  returning hits into current_hits;
  return current_hits <= least(greatest(maximum_hits,1),100);
end;
$$;
revoke all on function public.consume_rate_limit(text,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-images','listing-images',true,4000000,array['image/webp','image/jpeg','image/png'])
on conflict(id) do update set public=true,file_size_limit=4000000,allowed_mime_types=array['image/webp','image/jpeg','image/png'];
-- Public image delivery is intentional. Only the server's secret key can write.
commit;
