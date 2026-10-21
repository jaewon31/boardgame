-- Requires 001_accounts.sql. Safe to re-run; existing friendships are preserved.
begin;
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check(requester<>recipient)
);
create unique index if not exists friendship_pair on public.friendships(least(requester,recipient),greatest(requester,recipient));
create index if not exists friendship_recipient on public.friendships(recipient);
create index if not exists friendship_requester on public.friendships(requester);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;
drop policy if exists "participants read friendships" on public.friendships;
create policy "participants read friendships" on public.friendships for select to authenticated using ((select auth.uid()) in (requester,recipient));

create table if not exists public.friend_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day date not null,
  requests integer not null
);
alter table public.friend_request_limits enable row level security;
revoke all on public.friend_request_limits from anon, authenticated;

create or replace function public.list_friends()
returns table(id uuid,other_id uuid,display_name text,status text,incoming boolean,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select f.id,p.id,p.display_name,f.status,f.recipient=auth.uid(),f.created_at
  from public.friendships f join public.profiles p on p.id=case when f.requester=auth.uid() then f.recipient else f.requester end
  where auth.uid() is not null and auth.uid() in (f.requester,f.recipient)
  order by f.created_at desc;
$$;

create or replace function public.request_friend(friend_code_input text) returns text
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid(); target uuid; existing public.friendships; current_count integer;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if friend_code_input is null or upper(btrim(friend_code_input)) !~ '^[A-F0-9]{12}$' then raise exception 'INVALID_FRIEND_CODE'; end if;
  select p.id into target from public.profiles p where p.friend_code=upper(btrim(friend_code_input));
  if target is null then raise exception 'FRIEND_NOT_FOUND'; end if;
  if target=caller then raise exception 'SELF_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
  select f.* into existing from public.friendships f where least(f.requester,f.recipient)=least(caller,target) and greatest(f.requester,f.recipient)=greatest(caller,target);
  if existing.id is not null then
    if existing.status='accepted' then return 'already_friends'; end if;
    if existing.recipient=caller then return 'incoming_request'; end if;
    return 'request_pending';
  end if;
  if (select count(*) from public.friendships f where f.status='pending' and f.requester=caller)>=20 then raise exception 'PENDING_LIMIT'; end if;
  if (select count(*) from public.friendships f where caller in (f.requester,f.recipient) and f.status='accepted')>=200 then raise exception 'FRIEND_LIMIT'; end if;
  if (select count(*) from public.friendships f where f.status='pending' and f.recipient=target)>=100 then raise exception 'RECIPIENT_BUSY'; end if;
  insert into public.friend_request_limits as limits(user_id,day,requests) values(caller,current_date,1)
  on conflict(user_id) do update set day=current_date, requests=case when limits.day=current_date then limits.requests+1 else 1 end
  returning requests into current_count;
  if current_count>30 then raise exception 'DAILY_REQUEST_LIMIT'; end if;
  insert into public.friendships(requester,recipient) values(caller,target) on conflict do nothing;
  -- The opposite request may have arrived concurrently. It still needs acceptance.
  select f.* into existing from public.friendships f where least(f.requester,f.recipient)=least(caller,target) and greatest(f.requester,f.recipient)=greatest(caller,target);
  if existing.status='accepted' then return 'already_friends'; end if;
  if existing.recipient=caller then return 'incoming_request'; end if;
  return 'request_pending';
end;
$$;

create or replace function public.respond_friend(request_id uuid,accept_request boolean) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); request public.friendships;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('friend-accept',0));
  select f.* into request from public.friendships f where f.id=request_id for update;
  if request.id is null or request.recipient<>caller or request.status<>'pending' or accept_request is null then raise exception 'REQUEST_UNAVAILABLE'; end if;
  if accept_request then
    if (select count(*) from public.friendships f where f.status='accepted' and caller in (f.requester,f.recipient))>=200
    or (select count(*) from public.friendships f where f.status='accepted' and request.requester in (f.requester,f.recipient))>=200 then raise exception 'FRIEND_LIMIT'; end if;
    update public.friendships set status='accepted' where id=request_id;
  else delete from public.friendships where id=request_id;
  end if;
end;
$$;

create or replace function public.remove_friend(request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.friendships where id=request_id and auth.uid() in (requester,recipient);
  if not found then raise exception 'REQUEST_UNAVAILABLE'; end if;
end;
$$;
revoke all on function public.list_friends() from public,anon;
revoke all on function public.request_friend(text) from public,anon;
revoke all on function public.respond_friend(uuid,boolean) from public,anon;
revoke all on function public.remove_friend(uuid) from public,anon;
grant execute on function public.list_friends(),public.request_friend(text),public.respond_friend(uuid,boolean),public.remove_friend(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
