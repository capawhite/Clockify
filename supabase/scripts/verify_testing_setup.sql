-- Run in Supabase SQL Editor against the SAME project as NEXT_PUBLIC_SUPABASE_URL.
-- One result row = all checks visible at once (see supabase/TESTING_PHASE_CHECKLIST.md).
-- Uses strpos() instead of LIKE with %...% so the editor does not mis-parse identifiers.

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
),
fn_handle_new_user as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'handle_new_user'
    and pg_get_function_identity_arguments(p.oid) = ''
  limit 1
),
fn_profiles_before_update as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'profiles_before_update'
    and pg_get_function_identity_arguments(p.oid) = ''
  limit 1
),
auth_trg as (
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
)
select
  case
    when hu.def is null then 'MISSING: no public.handle_new_user'
    when strpos(hu.def, 'from public.workspaces') > 0
      and strpos(hu.def, 'order by created_at asc') > 0
      and strpos(hu.def, '''admin''') > 0
    then 'OK: testing migration (everyone workspace + admin)'
    when strpos(hu.def, 'insert into public.profiles') > 0
      and strpos(hu.def, '''member''') > 0
    then 'WARN: likely 001_initial — run apply_remaining_migrations.sql or 20260513120000'
    else 'UNKNOWN: compare to supabase/migrations/'
  end as handle_new_user,
  case
    when pb.def is null then 'MISSING: no public.profiles_before_update'
    when strpos(pb.def, 'auth.jwt()') > 0
      and strpos(pb.def, 'service_role') > 0
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
  (select currency from public.workspaces order by created_at asc limit 1) as workspace_currency,
  exists (
    select 1 from pg_indexes where indexname = 'time_entries_one_open_per_user_idx'
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
  ) as clients_default_is_billable
from rls_core
cross join auth_trg tr
left join fn_handle_new_user hu on true
left join fn_profiles_before_update pb on true;
