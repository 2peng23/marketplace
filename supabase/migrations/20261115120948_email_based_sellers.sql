begin;

-- The test brief uses listing email as the seller identity, without Supabase Auth.
-- Keep existing seller/account/order IDs intact while allowing email-only sellers.
alter table public.sellers drop constraint sellers_id_fkey;
alter table public.sellers alter column id set default gen_random_uuid();

create function public.connect_seller_email(seller_email text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare normalized_email text := lower(btrim(seller_email)); seller public.sellers;
begin
  if normalized_email is null or normalized_email = '' or length(normalized_email) > 254 then
    raise exception 'Invalid seller email';
  end if;
  -- Also taken by listing inserts, so concurrent setup cannot leave a listing unlinked.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_email, 0));
  insert into public.sellers(email) values(normalized_email)
    on conflict(email) do update set email=excluded.email
    returning * into seller;
  update public.listings l set seller_id=seller.id,updated_at=now()
    where lower(btrim(l.seller_email))=seller.email and l.seller_id is null;
  return to_jsonb(seller);
end;
$$;

create function public.match_listing_seller()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(btrim(new.seller_email)), 0));
  select s.id into new.seller_id from public.sellers s where s.email=lower(btrim(new.seller_email));
  return new;
end;
$$;
create trigger match_listing_seller_before_insert before insert on public.listings
  for each row execute function public.match_listing_seller();

update public.listings l set seller_id=s.id,updated_at=now()
  from public.sellers s where lower(btrim(l.seller_email))=s.email and l.seller_id is null;

drop function public.claim_listing(uuid,uuid);
revoke all on function public.connect_seller_email(text),public.match_listing_seller() from public,anon,authenticated;
grant execute on function public.connect_seller_email(text),public.match_listing_seller() to service_role;
commit;
