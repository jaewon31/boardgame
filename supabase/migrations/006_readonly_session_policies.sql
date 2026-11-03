begin;
-- POST current_account_session still records the newest login. GET policies only read.
create or replace function public.read_account_session() returns uuid
language sql stable security definer set search_path='' as $$
  select a.user_id
  from public.account_sessions a
  where a.user_id=auth.uid()
    and a.session_id=nullif(auth.jwt()->>'session_id','')::uuid
    and a.session_id=(select s.id from auth.sessions s where s.user_id=auth.uid()
                     order by s.created_at desc,s.id desc limit 1);
$$;
revoke all on function public.read_account_session() from public,anon;
grant execute on function public.read_account_session() to authenticated;
alter policy "only current session" on public.profiles
  using ((select public.read_account_session())=id)
  with check ((select public.read_account_session())=id);
alter policy "only current session" on public.friendships
  using ((select public.read_account_session()) is not null);
notify pgrst,'reload schema';
commit;
