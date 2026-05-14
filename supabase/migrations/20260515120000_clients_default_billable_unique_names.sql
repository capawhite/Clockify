-- Client-level default billable for new time entries; case-insensitive unique names per workspace.

alter table public.clients
  add column if not exists default_is_billable boolean not null default true;

comment on column public.clients.default_is_billable is
  'When set, new time entries for projects under this client default to this billable flag.';

create unique index if not exists clients_workspace_name_lower_idx
  on public.clients (workspace_id, lower(trim(name)));

create unique index if not exists projects_workspace_name_lower_idx
  on public.projects (workspace_id, lower(trim(name)));
