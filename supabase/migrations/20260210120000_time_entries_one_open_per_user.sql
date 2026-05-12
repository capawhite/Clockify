-- Enforce at most one running (open) time entry per user.
-- First, close duplicate open rows (keep the one with latest started_at; others get zero duration).

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
