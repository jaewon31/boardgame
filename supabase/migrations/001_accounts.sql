-- Apply in Supabase SQL Editor. Only account owners can access their profile.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '플레이어' check (char_length(display_name) between 1 and 12 and display_name=btrim(display_name) and display_name !~ '[[:cntrl:]]'),
  friend_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy "edit own profile" on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create function public.create_account_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id) values(new.id);
  return new;
end;
$$;
revoke all on function public.create_account_profile() from public, anon, authenticated;
create trigger create_account_profile after insert on auth.users for each row execute procedure public.create_account_profile();
insert into public.profiles(id) select id from auth.users on conflict(id) do nothing;
commit;
