-- =============================================================================
-- Apply remaining TimeTracker migrations (idempotent — safe to re-run)
-- Run in Supabase → SQL Editor on the SAME project as NEXT_PUBLIC_SUPABASE_URL
-- =============================================================================
-- You already ran: 20260515120000_clients_default_billable_unique_names.sql
-- This script applies the other migrations from supabase/migrations/ in order.
-- "Success. No rows returned" on each block is normal for DDL.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 20260210120000 — one running timer per user
-- -----------------------------------------------------------------------------
update public.time_entries te
set ended_at = te.started_at
where te.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id
        order by started_at desc, id desc
      ) as rn
    from public.time_entries
    where ended_at is null
  ) d
  where d.rn > 1
);

create unique index if not exists time_entries_one_open_per_user_idx
  on public.time_entries (user_id)
  where (ended_at is null);

-- -----------------------------------------------------------------------------
-- 2) 20260513120000 — new signups join first workspace as admin (testing-friendly)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  select id into new_workspace_id
  from public.workspaces
  order by created_at asc
  limit 1;

  if new_workspace_id is null then
    insert into public.workspaces (name)
    values ('My workspace')
    returning id into new_workspace_id;
  end if;

  insert into public.profiles (id, workspace_id, full_name, role)
  values (
    new.id,
    new_workspace_id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'admin'
  );

  return new;
end;
$$;

insert into public.workspaces (name)
select 'My workspace'
where not exists (select 1 from public.workspaces limit 1);

update public.profiles p
set
  workspace_id = (select id from public.workspaces order by created_at asc limit 1),
  role = 'admin'
where p.workspace_id is null;

-- -----------------------------------------------------------------------------
-- 3) 20260514120000 — service-role profile updates (invites / bootstrap)
-- -----------------------------------------------------------------------------
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if new.id is distinct from old.id then
    raise exception 'Cannot change profile id';
  end if;

  if coalesce((select auth.jwt()->>'role'), '') = 'service_role' then
    return new;
  end if;

  if new.id = auth.uid() then
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is distinct from 'admin' then
      new.workspace_id := old.workspace_id;
      new.role := old.role;
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) 20260515120000 — client default billable + unique names (skip if already ran)
-- -----------------------------------------------------------------------------
alter table public.clients
  add column if not exists default_is_billable boolean not null default true;

create unique index if not exists clients_workspace_name_lower_idx
  on public.clients (workspace_id, lower(trim(name)));

create unique index if not exists projects_workspace_name_lower_idx
  on public.projects (workspace_id, lower(trim(name)));

-- -----------------------------------------------------------------------------
-- 5) 20260516120000 — workspace currency EUR
-- -----------------------------------------------------------------------------
alter table public.workspaces
  alter column currency set default 'EUR';

update public.workspaces
set currency = 'EUR'
where currency is null or trim(currency) = '' or upper(trim(currency)) = 'USD';

-- -----------------------------------------------------------------------------
-- 6) 20260521120000 — realtime timer sync + single open timer on reopen
-- -----------------------------------------------------------------------------
alter table public.time_entries replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'time_entries'
  ) then
    alter publication supabase_realtime add table public.time_entries;
  end if;
end;
$$;

create or replace function public.time_entries_close_open_others()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is null then
    if tg_op = 'INSERT' then
      update public.time_entries
      set ended_at = new.started_at
      where user_id = new.user_id
        and ended_at is null
        and id is distinct from new.id;
    elsif tg_op = 'UPDATE' and old.ended_at is not null and new.ended_at is null then
      update public.time_entries
      set ended_at = new.started_at
      where user_id = new.user_id
        and ended_at is null
        and id is distinct from new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_close_open_others on public.time_entries;
create trigger time_entries_close_open_others
  before insert or update on public.time_entries
  for each row
  execute function public.time_entries_close_open_others();

-- -----------------------------------------------------------------------------
-- Quick verification (one result row)
-- -----------------------------------------------------------------------------
select
  (select currency from public.workspaces order by created_at limit 1) as workspace_currency,
  exists (
    select 1 from pg_indexes
    where indexname = 'time_entries_one_open_per_user_idx'
  ) as one_open_timer_index,
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'time_entries'
  ) as realtime_on_time_entries,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'default_is_billable'
  ) as clients_default_is_billable;
