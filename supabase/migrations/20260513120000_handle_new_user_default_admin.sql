-- Dev / testing: every new user becomes admin on the first workspace (or a new one).
-- Also backfills profiles that are still waiting for workspace assignment.

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

-- Ensure at least one workspace exists (for backfill below).
insert into public.workspaces (name)
select 'My workspace'
where not exists (select 1 from public.workspaces limit 1);

-- Attach any existing orphan profiles to that workspace as admin (testing convenience).
update public.profiles p
set
  workspace_id = (select id from public.workspaces order by created_at asc limit 1),
  role = 'admin'
where p.workspace_id is null;
