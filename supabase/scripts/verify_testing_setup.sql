-- Run in Supabase SQL Editor against the SAME project as NEXT_PUBLIC_SUPABASE_URL.
-- One result row = all checks visible at once (see supabase/TESTING_PHASE_CHECKLIST.md).

with rls_core as (
  select
    bool_and(coalesce(c.relrowsecurity, false)) as rls_enabled_all,
    count(*) filter (where coalesce(c.relrowsecurity, false))::int as tables_with_rls,
    count(*)::int as tables_checked
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname = any (
      array[
        'workspaces',
        'profiles',
        'clients',
        'projects',
        'project_members',
        'tasks',
        'tags',
        'time_entries',
        'time_entry_tags'
      ]
    )
)
select
  case
    when hu.def is null then 'MISSING: no public.handle_new_user'
    when hu.def like '%select id into new_workspace_id%'
      and hu.def like '%from public.workspaces%'
      and hu.def like '%order by created_at asc%'
    then 'OK: testing migration (everyone workspace + admin)'
    when hu.def like '%insert into public.profiles%'
      and hu.def like '%workspace_id%'
      and hu.def like '%null%'
    then 'WARN: likely 001_initial — run 20260513120000_handle_new_user_default_admin.sql'
    else 'UNKNOWN: compare to supabase/migrations/'
  end as handle_new_user,
  case
    when pb.def is null then 'MISSING: no public.profiles_before_update'
    when pb.def like '%auth.jwt()%'
      and pb.def like '%service_role%'
    then 'OK: service_role bypass present'
    else 'WARN: run 20260514120000_profiles_update_service_role_bypass.sql'
  end as profiles_before_update,
  case
    when tr.ok then 'OK: on_auth_user_created exists'
    else 'MISSING: signup will not create profiles'
  end as auth_trigger,
  case
    when rls_core.tables_checked = 0 then 'SKIP: core tables not found (schema not applied?)'
    when rls_core.rls_enabled_all then 'OK: RLS enabled on core app tables'
    else format(
      'WARN: RLS off on some tables (%s/%s) — app expects RLS from 001_initial.sql',
      rls_core.tables_with_rls::text,
      rls_core.tables_checked::text
    )
  end as core_tables_rls,
  left(hu.def, 120) as handle_new_user_preview,
  left(pb.def, 120) as profiles_trigger_preview
from rls_core
left join lateral (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'handle_new_user'
    and pg_get_function_identity_arguments(p.oid) = ''
  limit 1
) hu on true
left join lateral (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'profiles_before_update'
    and pg_get_function_identity_arguments(p.oid) = ''
  limit 1
) pb on true
cross join lateral (
  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and not t.tgisinternal
      and t.tgname = 'on_auth_user_created'
  ) as ok
) tr;
