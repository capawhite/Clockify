-- Realtime for cross-tab timer sync + single open timer on UPDATE reopen

alter table public.time_entries replica identity full;

-- Supabase exposes this publication for postgres_changes
alter publication supabase_realtime add table public.time_entries;

-- Extend single-open-timer behavior when a row is reopened (ended_at -> null)
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
