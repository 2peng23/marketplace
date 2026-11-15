begin;

create table public.sellers (
  id uuid primary key references auth.users(id),
  email text not null unique check (email = lower(btrim(email))),
  stripe_account_id text unique,
  stripe_country text check (stripe_country ~ '^[A-Z]{2}$'),
  stripe_payment_status text not null default 'not_connected',
  updated_at timestamptz not null default now()
);

alter table public.listings
  add column seller_id uuid references public.sellers(id),
  add column sale_status text not null default 'available' check (sale_status in ('available','reserved','sold')),
  add column reserved_order_id uuid;
revoke select on public.listings from anon,authenticated;
grant select(id,title,description,price,category,seller_email,image_path,created_at,updated_at,sale_status) on public.listings to anon,authenticated;

create table public.orders (
  id uuid primary key,
  listing_id uuid not null references public.listings(id),
  seller_id uuid not null references public.sellers(id),
  buyer_token_hash text not null check (buyer_token_hash ~ '^[a-f0-9]{64}$'),
  title text not null,
  currency text not null default 'usd' check (currency = 'usd'),
  amount_cents integer not null check (amount_cents between 50 and 99999999),
  platform_fee_cents integer not null check (platform_fee_cents > 0 and platform_fee_cents < amount_cents),
  stripe_account_id text not null,
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  status text not null default 'creating' check (status in ('creating','pending','paid','expired','cancelled','failed')),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.listings add constraint listings_reservation_order_fk foreign key (reserved_order_id) references public.orders(id);
create unique index orders_one_active_purchase_idx on public.orders(listing_id) where status in ('creating','pending','paid');
create index orders_seller_created_idx on public.orders(seller_id,created_at desc);
create index listings_seller_idx on public.listings(seller_id);

create table public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.sellers enable row level security;
alter table public.orders enable row level security;
alter table public.stripe_webhook_events enable row level security;
revoke all on public.sellers,public.orders,public.stripe_webhook_events from public,anon,authenticated;
grant all on public.sellers,public.orders,public.stripe_webhook_events to service_role;

-- All financial mutations run through the server. These functions are not public RPCs.
create function public.claim_listing(listing_identifier uuid,seller_identifier uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare item public.listings; owner_email text;
begin
  select email into owner_email from public.sellers where id=seller_identifier;
  select * into item from public.listings where id=listing_identifier for update;
  if item.id is null or owner_email is null or lower(item.seller_email) <> owner_email then
    raise exception 'Listing does not belong to this verified email' using errcode='42501';
  end if;
  if item.seller_id is not null and item.seller_id <> seller_identifier then
    raise exception 'Listing already claimed' using errcode='42501';
  end if;
  update public.listings set seller_id=seller_identifier,updated_at=now() where id=item.id;
end;
$$;

create function public.reserve_order(listing_identifier uuid,order_identifier uuid,buyer_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.listings; seller public.sellers; purchase public.orders; amount integer;
begin
  select * into item from public.listings where id=listing_identifier for update;
  if item.id is null then raise exception 'Listing not found' using errcode='P0002'; end if;
  select * into purchase from public.orders where id=order_identifier;
  if purchase.id is not null then
    if purchase.listing_id <> listing_identifier or purchase.buyer_token_hash <> buyer_hash then
      raise exception 'Request already used' using errcode='42501';
    end if;
    return to_jsonb(purchase);
  end if;
  if item.sale_status='reserved' then
    select * into purchase from public.orders where id=item.reserved_order_id;
    if purchase.buyer_token_hash=buyer_hash and purchase.status in ('creating','pending') then return to_jsonb(purchase); end if;
  end if;
  if item.sale_status <> 'available' then raise exception 'Item is unavailable' using errcode='P0001'; end if;
  select * into seller from public.sellers where id=item.seller_id;
  if seller.stripe_account_id is null or seller.stripe_payment_status <> 'active' then
    raise exception 'Seller is not ready for payments' using errcode='P0001';
  end if;
  if item.price*100 < 50 or item.price*100 > 99999999 then
    raise exception 'Price is not eligible for checkout' using errcode='P0001';
  end if;
  amount := (item.price*100)::integer;
  insert into public.orders(id,listing_id,seller_id,buyer_token_hash,title,amount_cents,platform_fee_cents,stripe_account_id)
    values(order_identifier,item.id,seller.id,buyer_hash,item.title,amount,floor((amount::bigint*1000+5000)/10000.0)::integer,seller.stripe_account_id)
    returning * into purchase;
  update public.listings set sale_status='reserved',reserved_order_id=purchase.id,updated_at=now() where id=item.id;
  return to_jsonb(purchase);
end;
$$;

create function public.release_order(order_identifier uuid,terminal_status text,event_identifier text default null,event_name text default 'checkout.session.expired')
returns void language plpgsql security invoker set search_path = '' as $$
declare purchase public.orders; listing_identifier uuid;
begin
  if terminal_status not in ('expired','cancelled','failed') then raise exception 'Invalid terminal status'; end if;
  select listing_id into listing_identifier from public.orders where id=order_identifier;
  if listing_identifier is null then return; end if;
  perform 1 from public.listings where id=listing_identifier for update;
  select * into purchase from public.orders where id=order_identifier for update;
  if event_identifier is not null then
    insert into public.stripe_webhook_events(id,event_type) values(event_identifier,event_name) on conflict do nothing;
    if not found then return; end if;
  end if;
  if purchase.status not in ('creating','pending') then return; end if;
  update public.orders set status=terminal_status,updated_at=now() where id=purchase.id;
  update public.listings set sale_status='available',reserved_order_id=null,updated_at=now()
    where id=purchase.listing_id and reserved_order_id=purchase.id and sale_status='reserved';
end;
$$;

create function public.confirm_order(order_identifier uuid,session_identifier text,payment_identifier text,event_identifier text,event_name text)
returns void language plpgsql security invoker set search_path = '' as $$
declare purchase public.orders; item public.listings; listing_identifier uuid;
begin
  select listing_id into listing_identifier from public.orders where id=order_identifier;
  if listing_identifier is null then return; end if;
  select * into item from public.listings where id=listing_identifier for update;
  select * into purchase from public.orders where id=order_identifier for update;
  insert into public.stripe_webhook_events(id,event_type) values(event_identifier,event_name) on conflict do nothing;
  if not found then return; end if;
  if purchase.stripe_session_id is distinct from session_identifier then raise exception 'Checkout Session does not match'; end if;
  if purchase.status='paid' then
    if purchase.stripe_payment_intent_id is distinct from payment_identifier then raise exception 'Payment does not match'; end if;
    return;
  end if;
  if purchase.status not in ('creating','pending') or item.sale_status <> 'reserved' or item.reserved_order_id is distinct from purchase.id then
    raise exception 'Paid order conflicts with inventory';
  end if;
  update public.orders set status='paid',stripe_payment_intent_id=payment_identifier,paid_at=now(),updated_at=now() where id=purchase.id;
  update public.listings set sale_status='sold',reserved_order_id=null,updated_at=now() where id=purchase.listing_id;
end;
$$;

revoke all on function public.claim_listing(uuid,uuid),public.reserve_order(uuid,uuid,text),public.release_order(uuid,text,text,text),public.confirm_order(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_listing(uuid,uuid),public.reserve_order(uuid,uuid,text),public.release_order(uuid,text,text,text),public.confirm_order(uuid,text,text,text,text) to service_role;

create or replace function public.browse_listings(category_filter text default '',search_term text default '',page_offset integer default 0,page_size integer default 12)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (
    select id,title,description,price,category,seller_email,image_path,created_at,sale_status
    from public.listings
    where (category_filter='' or category=category_filter)
      and (search_term='' or position(lower(search_term) in lower(title || ' ' || description))>0)
  ), selected as (
    select * from filtered order by created_at desc,id desc limit least(greatest(page_size,1),24) offset greatest(page_offset,0)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(selected order by created_at desc,id desc) from selected),'[]'::jsonb),'count',(select count(*) from filtered));
$$;

commit;
