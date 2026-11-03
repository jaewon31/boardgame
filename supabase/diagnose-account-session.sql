-- Read-only; run in the intended project's Supabase SQL Editor.
select jsonb_build_object(
  'tables', jsonb_build_object(
    'profiles', to_regclass('public.profiles'),
    'friendships', to_regclass('public.friendships'),
    'friend_request_limits', to_regclass('public.friend_request_limits'),
    'account_sessions', to_regclass('public.account_sessions')
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'volatility', p.provolatile, 'security_definer', p.prosecdef,
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE')
    )), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname in ('current_account_session', 'list_friends')
  ),
  'nickname_column', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'nickname_setup_complete'
  ),
  'migration_history_table', to_regclass('supabase_migrations.schema_migrations')
) as diagnostic;
