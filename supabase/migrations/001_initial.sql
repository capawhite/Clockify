-- TimeTracker initial schema (spec: .cursor/rules/timetracker.md)
-- Workspaces, profiles, clients, projects, project_members, tasks, tags,
-- time_entries, time_entry_tags + RLS + auth bootstrap.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'UTC',
  week_starts_on text not null default 'mon' check (week_starts_on in ('mon', 'sun')),
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

alter table public.workspaces add column if not exists timezone text not null default 'UTC';
alter table public.workspaces add column if not exists week_starts_on text not null default 'mon';
alter table public.workspaces add column if not exists currency text not null default 'USD';

do $$
begin
  alter table public.workspaces
    add constraint workspaces_week_starts_on_check
    check (week_starts_on in ('mon', 'sun'));
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  full_name text not null default '',
  role text not null default 'member'
    check (role in ('admin', 'manager', 'member')),
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists profiles_workspace_id_idx on public.profiles (workspace_id);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create index if not exists clients_workspace_id_idx on public.clients (workspace_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  name text not null,
  color text not null default '#6366f1',
  hourly_rate numeric(12, 2),
  is_billable boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists projects_workspace_id_idx on public.projects (workspace_id);
create index if not exists projects_client_id_idx on public.projects (client_id);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tasks_project_id_idx on public.tasks (project_id);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create index if not exists tags_workspace_id_idx on public.tags (workspace_id);
create unique index if not exists tags_workspace_name_lower_idx
  on public.tags (workspace_id, lower(name));

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  description text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer generated always as (
    case
      when ended_at is not null then greatest(
        0,
        floor(extract(epoch from (ended_at - started_at)))::integer
      )
      else null
    end
  ) stored,
  is_billable boolean not null default true,
  created_at timestamptz not null default now(),
  constraint time_entries_range check (ended_at is null or ended_at >= started_at)
);

create index if not exists time_entries_user_started_idx
  on public.time_entries (user_id, started_at desc);
create index if not exists time_entries_project_idx on public.time_entries (project_id);

create table if not exists public.time_entry_tags (
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (time_entry_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.current_profile_role() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.tags enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_tags enable row level security;

-- Workspaces
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces for select
  to authenticated
  using (id = public.current_workspace_id());

drop policy if exists "workspaces_update_admin" on public.workspaces;
create policy "workspaces_update_admin"
  on public.workspaces for update
  to authenticated
  using (
    id = public.current_workspace_id()
    and public.current_profile_role() = 'admin'
  )
  with check (
    id = public.current_workspace_id()
    and public.current_profile_role() = 'admin'
  );

-- Profiles (includes admin visibility of unassigned signups)
drop policy if exists "profiles_select_self_or_teammates" on public.profiles;
create policy "profiles_select_self_or_teammates"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or (
      workspace_id is not null
      and workspace_id = public.current_workspace_id()
    )
    or (
      public.current_profile_role() = 'admin'
      and public.current_workspace_id() is not null
      and profiles.workspace_id is null
    )
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (
    public.current_profile_role() = 'admin'
    and public.current_workspace_id() is not null
    and (
      profiles.id = auth.uid()
      or profiles.workspace_id is null
      or profiles.workspace_id = public.current_workspace_id()
    )
  )
  with check (
    public.current_profile_role() = 'admin'
    and (
      profiles.workspace_id = public.current_workspace_id()
      or profiles.id = auth.uid()
    )
  );

-- Clients
drop policy if exists "clients_select_workspace" on public.clients;
create policy "clients_select_workspace"
  on public.clients for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

drop policy if exists "clients_write_manager" on public.clients;
create policy "clients_write_manager"
  on public.clients for insert
  to authenticated
  with check (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() in ('admin', 'manager')
  );

drop policy if exists "clients_update_manager" on public.clients;
create policy "clients_update_manager"
  on public.clients for update
  to authenticated
  using (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() in ('admin', 'manager')
  )
  with check (workspace_id = public.current_workspace_id());

drop policy if exists "clients_delete_admin" on public.clients;
create policy "clients_delete_admin"
  on public.clients for delete
  to authenticated
  using (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() = 'admin'
  );

-- Projects
drop policy if exists "projects_select_workspace" on public.projects;
create policy "projects_select_workspace"
  on public.projects for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

drop policy if exists "projects_write_manager" on public.projects;
create policy "projects_write_manager"
  on public.projects for insert
  to authenticated
  with check (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() in ('admin', 'manager')
  );

drop policy if exists "projects_update_manager" on public.projects;
create policy "projects_update_manager"
  on public.projects for update
  to authenticated
  using (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() in ('admin', 'manager')
  )
  with check (workspace_id = public.current_workspace_id());

drop policy if exists "projects_delete_admin" on public.projects;
create policy "projects_delete_admin"
  on public.projects for delete
  to authenticated
  using (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() = 'admin'
  );

-- Project members
drop policy if exists "project_members_select" on public.project_members;
create policy "project_members_select"
  on public.project_members for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_members.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "project_members_write" on public.project_members;
create policy "project_members_write"
  on public.project_members for insert
  to authenticated
  with check (
    public.current_profile_role() in ('admin', 'manager')
    and exists (
      select 1
      from public.projects p
      where p.id = project_members.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "project_members_update" on public.project_members;
create policy "project_members_update"
  on public.project_members for update
  to authenticated
  using (
    public.current_profile_role() in ('admin', 'manager')
    and exists (
      select 1
      from public.projects p
      where p.id = project_members.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_members.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "project_members_delete" on public.project_members;
create policy "project_members_delete"
  on public.project_members for delete
  to authenticated
  using (
    public.current_profile_role() in ('admin', 'manager')
    and exists (
      select 1
      from public.projects p
      where p.id = project_members.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

-- Tasks
drop policy if exists "tasks_select_workspace" on public.tasks;
create policy "tasks_select_workspace"
  on public.tasks for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = tasks.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "tasks_write_manager" on public.tasks;
create policy "tasks_write_manager"
  on public.tasks for insert
  to authenticated
  with check (
    public.current_profile_role() in ('admin', 'manager')
    and exists (
      select 1
      from public.projects p
      where p.id = tasks.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "tasks_update_manager" on public.tasks;
create policy "tasks_update_manager"
  on public.tasks for update
  to authenticated
  using (
    public.current_profile_role() in ('admin', 'manager')
    and exists (
      select 1
      from public.projects p
      where p.id = tasks.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = tasks.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "tasks_delete_manager" on public.tasks;
create policy "tasks_delete_manager"
  on public.tasks for delete
  to authenticated
  using (
    public.current_profile_role() in ('admin', 'manager')
    and exists (
      select 1
      from public.projects p
      where p.id = tasks.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

-- Tags
drop policy if exists "tags_select_workspace" on public.tags;
create policy "tags_select_workspace"
  on public.tags for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

drop policy if exists "tags_write_manager" on public.tags;
create policy "tags_write_manager"
  on public.tags for insert
  to authenticated
  with check (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() in ('admin', 'manager')
  );

drop policy if exists "tags_update_manager" on public.tags;
create policy "tags_update_manager"
  on public.tags for update
  to authenticated
  using (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() in ('admin', 'manager')
  )
  with check (workspace_id = public.current_workspace_id());

drop policy if exists "tags_delete_admin" on public.tags;
create policy "tags_delete_admin"
  on public.tags for delete
  to authenticated
  using (
    workspace_id = public.current_workspace_id()
    and public.current_profile_role() = 'admin'
  );

-- Time entries (members own; managers read workspace; admins full)
drop policy if exists "time_entries_select" on public.time_entries;
create policy "time_entries_select"
  on public.time_entries for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.current_profile_role() in ('admin', 'manager')
      and exists (
        select 1
        from public.projects p
        where p.id = time_entries.project_id
          and p.workspace_id = public.current_workspace_id()
      )
    )
  );

drop policy if exists "time_entries_insert" on public.time_entries;
create policy "time_entries_insert"
  on public.time_entries for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.projects p
      where p.id = time_entries.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "time_entries_update" on public.time_entries;
create policy "time_entries_update"
  on public.time_entries for update
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.current_profile_role() = 'admin'
      and exists (
        select 1
        from public.projects p
        where p.id = time_entries.project_id
          and p.workspace_id = public.current_workspace_id()
      )
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = time_entries.project_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete"
  on public.time_entries for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.current_profile_role() = 'admin'
      and exists (
        select 1
        from public.projects p
        where p.id = time_entries.project_id
          and p.workspace_id = public.current_workspace_id()
      )
    )
  );

-- Time entry tags (owner or admin)
drop policy if exists "time_entry_tags_select" on public.time_entry_tags;
create policy "time_entry_tags_select"
  on public.time_entry_tags for select
  to authenticated
  using (
    exists (
      select 1
      from public.time_entries te
      where te.id = time_entry_tags.time_entry_id
        and (
          te.user_id = auth.uid()
          or (
            public.current_profile_role() in ('admin', 'manager')
            and exists (
              select 1
              from public.projects p
              where p.id = te.project_id
                and p.workspace_id = public.current_workspace_id()
            )
          )
        )
    )
  );

drop policy if exists "time_entry_tags_write" on public.time_entry_tags;
create policy "time_entry_tags_write"
  on public.time_entry_tags for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.time_entries te
      where te.id = time_entry_tags.time_entry_id
        and te.user_id = auth.uid()
    )
    or (
      public.current_profile_role() = 'admin'
      and exists (
        select 1
        from public.time_entries te
        join public.projects p on p.id = te.project_id
        where te.id = time_entry_tags.time_entry_id
          and p.workspace_id = public.current_workspace_id()
      )
    )
  );

drop policy if exists "time_entry_tags_delete" on public.time_entry_tags;
create policy "time_entry_tags_delete"
  on public.time_entry_tags for delete
  to authenticated
  using (
    exists (
      select 1
      from public.time_entries te
      where te.id = time_entry_tags.time_entry_id
        and te.user_id = auth.uid()
    )
    or (
      public.current_profile_role() = 'admin'
      and exists (
        select 1
        from public.time_entries te
        join public.projects p on p.id = te.project_id
        where te.id = time_entry_tags.time_entry_id
          and p.workspace_id = public.current_workspace_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

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

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update
  before update on public.profiles
  for each row
  execute function public.profiles_before_update();

create or replace function public.projects_enforce_client_workspace()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.clients c
    where c.id = new.client_id
      and c.workspace_id = new.workspace_id
  ) then
    raise exception 'client does not belong to this workspace';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_enforce_client_workspace on public.projects;
create trigger projects_enforce_client_workspace
  before insert or update on public.projects
  for each row
  execute function public.projects_enforce_client_workspace();

-- Only one running timer per user (ended_at is null)
create or replace function public.time_entries_close_open_others()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is null then
    update public.time_entries
    set ended_at = new.started_at
    where user_id = new.user_id
      and ended_at is null
      and id is distinct from new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_close_open_others on public.time_entries;
create trigger time_entries_close_open_others
  before insert on public.time_entries
  for each row
  execute function public.time_entries_close_open_others();

-- ---------------------------------------------------------------------------
-- Auth bootstrap
-- ---------------------------------------------------------------------------

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

  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name)
    values ('My workspace')
    returning id into new_workspace_id;

    insert into public.profiles (id, workspace_id, full_name, role)
    values (
      new.id,
      new_workspace_id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'admin'
    );
  else
    insert into public.profiles (id, workspace_id, full_name, role)
    values (
      new.id,
      null,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'member'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

insert into public.profiles (id, workspace_id, full_name, role)
select
  u.id,
  null,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'member'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

do $$
declare
  w_id uuid;
  first_uid uuid;
begin
  if exists (select 1 from public.workspaces) then
    return;
  end if;
  if not exists (select 1 from auth.users) then
    return;
  end if;

  insert into public.workspaces (name)
  values ('My workspace')
  returning id into w_id;

  select id into first_uid
  from auth.users
  order by created_at asc
  limit 1;

  update public.profiles
  set
    workspace_id = w_id,
    role = 'admin'
  where id = first_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.time_entry_tags to authenticated;

grant usage on schema public to authenticated;
