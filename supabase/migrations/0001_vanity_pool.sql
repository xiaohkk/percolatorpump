-- Vanity keypair pool. Rows are pre-ground keypairs whose base58 pubkey ends
-- in the given suffix (e.g. "perc"). Secret keys are AES-256-GCM encrypted
-- with a key held only by the backend (VANITY_POOL_ENCRYPTION_KEY).

create table if not exists vanity_pool (
  id               bigserial primary key,
  suffix           text        not null,
  pubkey           text        not null unique,
  encrypted_secret bytea       not null,
  iv               bytea       not null,
  auth_tag         bytea       not null,
  claimed_at       timestamptz,
  claimed_by       text,
  created_at       timestamptz not null default now()
);

create index if not exists vanity_pool_suffix_idx    on vanity_pool (suffix);
create index if not exists vanity_pool_claimed_idx   on vanity_pool (claimed_at);
-- Fast lookup for "next unclaimed row with suffix X":
create index if not exists vanity_pool_unclaimed_idx
  on vanity_pool (suffix)
  where claimed_at is null;

-- Atomic pop: locks the next unclaimed row for the given suffix, marks it
-- claimed, and returns it. Uses FOR UPDATE SKIP LOCKED so concurrent callers
-- never see the same row.
create or replace function pop_vanity_keypair(p_suffix text)
returns table (
  id               bigint,
  suffix           text,
  pubkey           text,
  encrypted_secret bytea,
  iv               bytea,
  auth_tag         bytea,
  claimed_at       timestamptz
)
language plpgsql
as $$
declare
  v_id bigint;
begin
  select vp.id into v_id
  from vanity_pool vp
  where vp.suffix = p_suffix
    and vp.claimed_at is null
  order by vp.id
  limit 1
  for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
  update vanity_pool
     set claimed_at = now()
   where vanity_pool.id = v_id
  returning
    vanity_pool.id,
    vanity_pool.suffix,
    vanity_pool.pubkey,
    vanity_pool.encrypted_secret,
    vanity_pool.iv,
    vanity_pool.auth_tag,
    vanity_pool.claimed_at;
end;
$$;
