-- Execute no SQL Editor do Supabase

alter table public.guilds
  add column if not exists view_count bigint not null default 0,
  add column if not exists like_count bigint not null default 0;

create table if not exists public.guild_likes (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

alter table public.guild_likes enable row level security;

drop policy if exists "public read likes" on public.guild_likes;
create policy "public read likes" on public.guild_likes
for select using (true);

drop policy if exists "users add own like" on public.guild_likes;
create policy "users add own like" on public.guild_likes
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "users remove own like" on public.guild_likes;
create policy "users remove own like" on public.guild_likes
for delete to authenticated
using (user_id = auth.uid());

create or replace function public.increment_guild_view(guild_uuid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.guilds
  set view_count = coalesce(view_count, 0) + 1,
      updated_at = now()
  where id = guild_uuid;
$$;

revoke all on function public.increment_guild_view(uuid) from public;
grant execute on function public.increment_guild_view(uuid) to anon, authenticated;

create or replace function public.sync_guild_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.guilds set like_count = coalesce(like_count, 0) + 1 where id = new.guild_id;
  elsif tg_op = 'DELETE' then
    update public.guilds set like_count = greatest(coalesce(like_count, 0) - 1, 0) where id = old.guild_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_guild_like_count on public.guild_likes;
create trigger sync_guild_like_count
after insert or delete on public.guild_likes
for each row execute function public.sync_guild_like_count();
