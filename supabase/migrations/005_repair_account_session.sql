-- Recovery for projects with 001/002 but missing or partially deployed 003/004.
-- Reinstalls their complete security contract atomically; no user rows are deleted.
-- Also safe after 004. Do not use to bootstrap a project without 001/002.
begin;
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.friendships') is null
    or to_regclass('public.friend_request_limits') is null then
    raise exception 'Apply missing 001_accounts / 002_friends prerequisites first';
  end if;
end;
$$;
create table if not exists public.account_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  signed_in_at timestamptz not null
);
alter table public.account_sessions enable row level security;
revoke all on public.account_sessions from public,anon,authenticated;

-- Identity and session are taken exclusively from the verified JWT and Auth DB.
-- Remember the newest login even after logout, so old sessions cannot take over.
create or replace function public.current_account_session() returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); current_id uuid; latest auth.sessions; active_id uuid;
begin
  if caller is null then return null; end if;
  current_id:=nullif(auth.jwt()->>'session_id','')::uuid;
  if current_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text,743));
  select * into latest from auth.sessions where user_id=caller order by created_at desc,id desc limit 1;
  if latest.id is null then return null; end if;
  insert into public.account_sessions(user_id,session_id,signed_in_at)
    values(caller,latest.id,latest.created_at)
    on conflict(user_id) do update set session_id=excluded.session_id,signed_in_at=excluded.signed_in_at
    where (excluded.signed_in_at,excluded.session_id)>(account_sessions.signed_in_at,account_sessions.session_id);
  select session_id into active_id from public.account_sessions where user_id=caller;
  if active_id=current_id and exists(select 1 from auth.sessions where id=current_id and user_id=caller) then return caller; end if;
  return null;
end;
$$;
revoke all on function public.current_account_session() from public,anon;
grant execute on function public.current_account_session() to authenticated;

drop policy if exists "only current session" on public.profiles;
create policy "only current session" on public.profiles as restrictive to authenticated
  using ((select public.current_account_session())=id) with check ((select public.current_account_session())=id);
drop policy if exists "only current session" on public.friendships;
create policy "only current session" on public.friendships as restrictive to authenticated
  using ((select public.current_account_session()) is not null);
create or replace function public.list_friends()
returns table(id uuid,other_id uuid,display_name text,status text,incoming boolean,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select f.id,p.id,p.display_name,f.status,f.recipient=auth.uid(),f.created_at
  from public.friendships f join public.profiles p on p.id=case when f.requester=auth.uid() then f.recipient else f.requester end
  where public.current_account_session() is not null and auth.uid() in (f.requester,f.recipient)
  order by f.created_at desc;
$$;

create or replace function public.request_friend(friend_code_input text) returns text
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid(); target uuid; existing public.friendships; current_count integer;
begin
  if public.current_account_session() is null then raise exception 'AUTH_REQUIRED'; end if;
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
  if public.current_account_session() is null then raise exception 'AUTH_REQUIRED'; end if;
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
  if public.current_account_session() is null then raise exception 'AUTH_REQUIRED'; end if;
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


alter table public.profiles add column if not exists nickname_setup_complete boolean not null default false;
-- Preserve existing named profiles, including users who explicitly chose the default name.
update public.profiles p set nickname_setup_complete=true
from auth.users u where u.id=p.id and not p.nickname_setup_complete
  and (p.display_name<>'플레이어' or u.raw_user_meta_data->>'nickname_setup_complete'='true');
grant update(nickname_setup_complete) on public.profiles to authenticated;
-- Existing owner and restrictive current-session policies apply to this column too.
-- Anonymous Auth users have role authenticated, NOT anon. Do not broaden RLS.
-- list_friends calls current_account_session (which can write); it must be VOLATILE.
alter function public.list_friends() volatile;
notify pgrst,'reload schema';

commit;
