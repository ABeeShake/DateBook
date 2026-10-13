-- Datebook V1: run in Supabase SQL Editor on a NEW project.
-- Auth is email OTP; only authenticated users can access private data.

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our datebook',
  invite_code text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (length(trim(title)) between 1 and 200),
  venue text,
  source_url text,
  canonical_url text,
  category text not null default 'Other'
    check (category in ('Food','Activity','Event','Outdoors','Other')),
  notes text,
  price_note text,
  status text not null default 'saved'
    check (status in ('saved','planned','done')),
  created_at timestamptz not null default now(),
  unique (couple_id, canonical_url)
);
create index ideas_couple_created_at on public.ideas(couple_id, created_at desc);

create table public.idea_interests (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  interested boolean not null default true,
  primary key (idea_id,user_id)
);

-- "Seen" means opened inside Datebook, not viewed on Instagram/TikTok.
create table public.idea_seen (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  seen_at timestamptz not null default now(),
  primary key (idea_id,user_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index plans_couple_start on public.plans(couple_id,scheduled_start);

-- Avoid recursive RLS lookups by resolving membership in a controlled function.
create or replace function public.is_couple_member(p_couple_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.couple_members
    where couple_id = p_couple_id and user_id = (select auth.uid())
  );
$$;

-- Create both the couple and its creator membership atomically.
create or replace function public.create_couple(p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_couple uuid;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if not (length(trim(coalesce(p_display_name,''))) between 1 and 60) then
    raise exception 'Enter a name (1–60 characters)';
  end if;
  if exists (select 1 from public.couple_members where user_id = v_user) then
    raise exception 'You already belong to a datebook';
  end if;
  insert into public.couples(name,invite_code,created_by)
  values ('Our datebook',upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),v_user)
  returning id into v_couple;
  insert into public.couple_members(couple_id,user_id,display_name)
  values (v_couple,v_user,trim(p_display_name));
  return v_couple;
end;
$$;

-- Join one existing couple; row lock prevents simultaneous third-member joins.
create or replace function public.join_couple(p_invite_code text,p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_couple uuid; v_count integer;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if not (length(trim(coalesce(p_display_name,''))) between 1 and 60) then
    raise exception 'Enter a name (1–60 characters)';
  end if;
  if exists (select 1 from public.couple_members where user_id=v_user) then
    raise exception 'You already belong to a datebook';
  end if;
  select id into v_couple from public.couples
   where invite_code = upper(trim(p_invite_code)) for update;
  if v_couple is null then raise exception 'Invalid invite code'; end if;
  select count(*) into v_count from public.couple_members where couple_id = v_couple;
  if v_count >= 2 then raise exception 'This datebook already has two members'; end if;
  insert into public.couple_members(couple_id,user_id,display_name)
  values(v_couple,v_user,trim(p_display_name));
  return v_couple;
end;
$$;

revoke all on function public.is_couple_member(uuid) from public;
revoke all on function public.create_couple(text) from public;
revoke all on function public.join_couple(text,text) from public;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant execute on function public.create_couple(text) to authenticated;
grant execute on function public.join_couple(text,text) to authenticated;

alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_interests enable row level security;
alter table public.plans enable row level security;
alter table public.idea_seen enable row level security;

create policy couples_read on public.couples for select to authenticated
using (public.is_couple_member(id));
create policy members_read on public.couple_members for select to authenticated
using (public.is_couple_member(couple_id));

create policy ideas_read on public.ideas for select to authenticated
using (public.is_couple_member(couple_id));
create policy ideas_insert on public.ideas for insert to authenticated
with check (public.is_couple_member(couple_id) and created_by = (select auth.uid()));
create policy ideas_update on public.ideas for update to authenticated
using (public.is_couple_member(couple_id))
with check (public.is_couple_member(couple_id));
create policy ideas_delete on public.ideas for delete to authenticated
using (public.is_couple_member(couple_id));

create policy interests_read on public.idea_interests for select to authenticated
using (exists (select 1 from public.ideas i where i.id = idea_id and public.is_couple_member(i.couple_id)));
create policy interests_insert on public.idea_interests for insert to authenticated
with check (user_id = (select auth.uid()) and exists
 (select 1 from public.ideas i where i.id = idea_id and public.is_couple_member(i.couple_id)));
create policy interests_update on public.idea_interests for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists
 (select 1 from public.ideas i where i.id = idea_id and public.is_couple_member(i.couple_id)));
create policy interests_delete on public.idea_interests for delete to authenticated
using (user_id = (select auth.uid()));

create policy seen_read on public.idea_seen for select to authenticated
using (exists (select 1 from public.ideas i where i.id = idea_id and public.is_couple_member(i.couple_id)));
create policy seen_insert on public.idea_seen for insert to authenticated
with check (user_id = (select auth.uid()) and exists
 (select 1 from public.ideas i where i.id = idea_id and public.is_couple_member(i.couple_id)));
create policy seen_update on public.idea_seen for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists
 (select 1 from public.ideas i where i.id = idea_id and public.is_couple_member(i.couple_id)));

create policy plans_read on public.plans for select to authenticated
using (public.is_couple_member(couple_id));
create policy plans_insert on public.plans for insert to authenticated
with check (public.is_couple_member(couple_id) and created_by = (select auth.uid()) and
 exists (select 1 from public.ideas i where i.id = idea_id and i.couple_id = plans.couple_id));
create policy plans_update on public.plans for update to authenticated
using (public.is_couple_member(couple_id))
with check (public.is_couple_member(couple_id) and exists
 (select 1 from public.ideas i where i.id = idea_id and i.couple_id = plans.couple_id));
create policy plans_delete on public.plans for delete to authenticated
using (public.is_couple_member(couple_id));

-- Prevent authorized members from reassigning ownership/tenant keys.
create or replace function public.protect_idea_ownership()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.couple_id, new.created_by) is distinct from (old.couple_id,old.created_by) then
    raise exception 'Idea ownership cannot be changed';
  end if;
  return new;
end;
$$;
create trigger ideas_ownership_lock before update on public.ideas
for each row execute function public.protect_idea_ownership();

create or replace function public.protect_plan_ownership()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.couple_id, new.created_by) is distinct from (old.couple_id,old.created_by) then
    raise exception 'Plan ownership cannot be changed';
  end if;
  return new;
end;
$$;
create trigger plans_ownership_lock before update on public.plans
for each row execute function public.protect_plan_ownership();

-- SQL permissions are explicit; RLS policies still govern every row.
grant select on public.couples, public.couple_members to authenticated;
grant select, insert, update, delete on public.ideas, public.idea_interests, public.plans to authenticated;
grant select, insert, update on public.idea_seen to authenticated;
