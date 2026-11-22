-- Cargos visuais independentes das permissões administrativas

alter table public.profiles
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists bio text;

create table if not exists public.visual_roles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  emoji text not null,
  gradient text not null
);

create table if not exists public.user_visual_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.visual_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

alter table public.visual_roles enable row level security;
alter table public.user_visual_roles enable row level security;

insert into public.visual_roles(slug, name, emoji, gradient)
values
  ('dev', 'Dev', '🛠️', 'linear-gradient(135deg, #ff1535 0 50%, #7a1421 75%, #141414 100%)'),
  ('content_creator', 'Content Creator', '🎬', 'linear-gradient(135deg, #ff1688 0%, #ff78c5 55%, #fff 100%)')
  on conflict (slug) do update set
    name = excluded.name,
    emoji = excluded.emoji,
    gradient = excluded.gradient;

create or replace function public.is_visual_roles_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email', '')) in (
    'guilhermetrrs14@gmail.com',
    'mutanoegamer@gmail.com'
  );
$$;

drop policy if exists "public read visual roles" on public.visual_roles;
create policy "public read visual roles" on public.visual_roles
for select using (true);

drop policy if exists "public read user visual roles" on public.user_visual_roles;
create policy "public read user visual roles" on public.user_visual_roles
for select using (true);

drop policy if exists "supreme admins manage visual roles" on public.user_visual_roles;
create policy "supreme admins manage visual roles" on public.user_visual_roles
for all using (public.is_visual_roles_admin())
with check (public.is_visual_roles_admin());

create or replace function public.assign_visual_role(target_profile uuid, target_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  role_uuid uuid;
begin
  if not public.is_visual_roles_admin() then
    raise exception 'Acesso negado';
  end if;

  select id into role_uuid from public.visual_roles where slug = target_role;
  if role_uuid is null then
    raise exception 'Cargo visual inválido';
  end if;

  insert into public.user_visual_roles(profile_id, role_id)
  values (target_profile, role_uuid)
  on conflict do nothing;
end;
$$;

create or replace function public.remove_visual_role(target_profile uuid, target_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_visual_roles_admin() then
    raise exception 'Acesso negado';
  end if;

  delete from public.user_visual_roles ur
  using public.visual_roles vr
  where ur.profile_id = target_profile
    and ur.role_id = vr.id
    and vr.slug = target_role;
end;
$$;

revoke all on function public.assign_visual_role(uuid, text) from public, anon;
grant execute on function public.assign_visual_role(uuid, text) to authenticated;
revoke all on function public.remove_visual_role(uuid, text) from public, anon;
grant execute on function public.remove_visual_role(uuid, text) to authenticated;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = (select email from auth.users where id = new.id)
  where id = new.id;
  return new;
end;
$$;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned_role text := 'user';
begin
  if lower(coalesce(new.email,'')) = 'guilhermetrrs14@gmail.com' then
    assigned_role := 'supreme';
  elsif lower(coalesce(new.email,'')) = 'mutanoegamer@gmail.com' then
    assigned_role := 'admin';
  end if;

  insert into public.profiles(id, email, role)
  values (new.id, new.email, assigned_role)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
