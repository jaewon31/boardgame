-- READ ONLY: run separately in the intended Supabase project's SQL Editor.
-- Does not apply 007; does not read user/profile/friendship rows or JWT values.
-- Review results against docs/p2-rpc-security-review.md before approval.
begin transaction read only;
select current_database() as database_name, current_user as inspection_role;
select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('friendships','profiles','account_sessions')
order by table_name,ordinal_position;
select conrelid::regclass as relation,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.friendships'::regclass,'public.profiles'::regclass);
select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in ('friendships','profiles');
select relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) as owner
from pg_class where oid in ('public.friendships'::regclass,'public.profiles'::regclass,'public.account_sessions'::regclass);
select * from pg_policies where schemaname='public' and tablename in ('friendships','profiles','account_sessions');
-- Includes every overload; before first application, the new permission RPC is absent.
select p.oid::regprocedure as signature,pg_get_userbyid(p.proowner) as owner,
 p.prosecdef,p.provolatile,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in
 ('can_compare_friend_stats','current_account_session','read_account_session','list_friends','remove_friend'))
 or (n.nspname='auth' and p.proname in ('uid','jwt'));
select p.oid::regprocedure as signature,r.rolname,
 has_function_privilege(r.oid,p.oid,'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join pg_roles r
where n.nspname='public' and p.proname='can_compare_friend_stats'
 and r.rolname in ('anon','authenticated','service_role','postgres');
select rolname,rolsuper,rolbypassrls,rolcanlogin from pg_roles
where rolname in ('anon','authenticated','service_role','postgres');
select member_role.rolname as member,granted_role.rolname as granted_role
from pg_auth_members m join pg_roles member_role on member_role.oid=m.member
join pg_roles granted_role on granted_role.oid=m.roleid
where member_role.rolname in ('anon','authenticated','service_role','postgres');
select pg_get_userbyid(defaclrole) as owner,defaclnamespace::regnamespace as schema,
 defaclobjtype,defaclacl from pg_default_acl;
-- Inventory only: inspect any custom block/ban feature before asserting block support.
select table_schema,table_name from information_schema.tables
where table_schema not in ('pg_catalog','information_schema') and table_name ~* '(block|ban)';
commit;
