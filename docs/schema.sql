create schema if not exists mappa_private;
revoke all on schema mappa_private from public, anon, authenticated;
create table mappa_private.config (id boolean primary key default true check(id), secret_hash text not null);
insert into mappa_private.config values (true,'fb3919637fdb62205c4063a80313a32682565e5af84bd69c979d078c3852c170');
create table mappa_private.rooms (code text primary key, revision integer not null default 0, state jsonb not null, updated_at timestamptz not null default now());
alter table mappa_private.rooms enable row level security;
alter table mappa_private.config enable row level security;
create table mappa_private.quotas (key text primary key, count integer not null, window_start timestamptz not null default now());
alter table mappa_private.quotas enable row level security;
create function mappa_private.authorized(secret text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from mappa_private.config where secret_hash=encode(sha256(convert_to(secret,'UTF8')),'hex')) $$;
create function public.mappa_read(p_secret text,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$ begin if not mappa_private.authorized(p_secret) then raise insufficient_privilege; end if; return (select state from mappa_private.rooms where code=p_code); end $$;
create function public.mappa_insert(p_secret text,p_state jsonb) returns boolean language plpgsql security definer set search_path='' as $$ begin if not mappa_private.authorized(p_secret) then raise insufficient_privilege; end if; insert into mappa_private.rooms(code,state) values(p_state->>'code',p_state) on conflict do nothing; return found; end $$;
create function public.mappa_cas(p_secret text,p_code text,p_revision integer,p_state jsonb,p_notify boolean default true) returns boolean language plpgsql security definer set search_path='' as $$ begin if not mappa_private.authorized(p_secret) then raise insufficient_privilege; end if; update mappa_private.rooms set state=p_state,revision=p_revision+1,updated_at=now() where code=p_code and revision=p_revision; if not found then return false; end if; if p_notify then perform realtime.send(jsonb_build_object('revision',p_revision+1),'change','mappa:'||(p_state->>'channel'),false); end if; return true; end $$;
create function public.mappa_quota(p_secret text,p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$ declare n integer; begin if not mappa_private.authorized(p_secret) then raise insufficient_privilege; end if; insert into mappa_private.quotas(key,count) values(p_key,1) on conflict(key) do update set count=case when mappa_private.quotas.window_start<now()-interval '1 hour' then 1 else mappa_private.quotas.count+1 end,window_start=case when mappa_private.quotas.window_start<now()-interval '1 hour' then now() else mappa_private.quotas.window_start end returning count into n; return n<=p_limit; end $$;
revoke all on function mappa_private.authorized(text) from public,anon,authenticated;
revoke all on function public.mappa_read(text,text),public.mappa_insert(text,jsonb),public.mappa_cas(text,text,integer,jsonb,boolean),public.mappa_quota(text,text,integer) from public,anon,authenticated;
-- Intentional backend RPCs: the publishable key alone grants no access. Every function checks a 256-bit server secret.
grant execute on function public.mappa_read(text,text),public.mappa_insert(text,jsonb),public.mappa_cas(text,text,integer,jsonb,boolean),public.mappa_quota(text,text,integer) to anon;
