-- Service-role updates (e.g. app bootstrap) must not be forced back to old workspace_id/role
-- by profiles_before_update when auth.uid() matches the row in some JWT contexts.

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
