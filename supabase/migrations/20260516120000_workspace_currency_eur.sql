-- Default and migrate workspace currency to euros.

alter table public.workspaces
  alter column currency set default 'EUR';

update public.workspaces
set currency = 'EUR'
where currency is null or trim(currency) = '' or upper(trim(currency)) = 'USD';
