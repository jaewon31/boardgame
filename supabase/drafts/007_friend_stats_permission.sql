-- DRAFT: local validation only. Requires 001-006, including read_account_session.
-- Execute as the trusted postgres migration owner only after production preflight/approval.
-- Adds a boolean permission check; does not widen table SELECT policies or expose profiles.
begin;
create or replace function public.can_compare_friend_stats(first_id uuid, second_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(auth.uid() is not null
    and auth.jwt()->>'role'='authenticated'
    and public.read_account_session()=auth.uid()
    and first_id is not null and second_id is not null and first_id <> second_id
    and exists(select 1 from public.profiles where id=first_id)
    and exists(select 1 from public.profiles where id=second_id)
    and not exists (
      select 1 from (values (auth.uid(),first_id),(auth.uid(),second_id),(first_id,second_id)) as pairs(a,b)
      where a<>b and not exists (
        select 1 from public.friendships f where f.status='accepted'
          and least(f.requester,f.recipient)=least(a,b)
          and greatest(f.requester,f.recipient)=greatest(a,b)
      )
    ),false);
$$;
alter function public.can_compare_friend_stats(uuid,uuid) owner to postgres;
revoke all on function public.can_compare_friend_stats(uuid,uuid) from public,anon,service_role;
grant execute on function public.can_compare_friend_stats(uuid,uuid) to authenticated;
-- CREATE OR REPLACE retains old ACL entries. Reject unexpected grants instead of
-- silently shipping an older/custom role's permission alongside this contract.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p,
      lateral pg_catalog.aclexplode(p.proacl) a
    where p.oid='public.can_compare_friend_stats(uuid,uuid)'::regprocedure
      and (a.grantee not in ('postgres'::regrole,'authenticated'::regrole)
        or (a.grantee='authenticated'::regrole and a.is_grantable))
  ) then raise exception 'Unexpected friend stats RPC ACL; review grants before applying'; end if;
end;
$$;
notify pgrst,'reload schema';
commit;
