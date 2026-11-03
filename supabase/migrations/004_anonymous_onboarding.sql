-- Additive migration. Apply AFTER 001, 002, 003 and before the mobile update.
begin;
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
