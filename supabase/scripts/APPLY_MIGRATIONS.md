# Apply database migrations (Supabase)

Use this when your **hosted Supabase** project is behind the migrations in `supabase/migrations/`.

## Step 1 — Open SQL Editor

1. [Supabase Dashboard](https://supabase.com/dashboard) → your project (same URL as `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`).
2. **SQL Editor** → **New query**.

## Step 2 — Run the bundle script

1. Open [`apply_remaining_migrations.sql`](apply_remaining_migrations.sql) in this repo.
2. Copy the **entire file** and paste into the SQL Editor.
3. Click **Run**.

You should see **Success** and a small result table at the bottom, for example:

| workspace_currency | one_open_timer_index | realtime_on_time_entries | clients_default_is_billable |
|--------------------|----------------------|--------------------------|-----------------------------|
| EUR                | true                 | true                     | true                          |

All four should be `EUR` / `true`. If any are wrong, say which column failed.

> **Note:** Block 2 makes **new signups** admins on the first workspace (good for a small internal team). It also attaches any profile still missing `workspace_id` to that workspace as admin.

## Step 3 — Verify auth triggers (optional)

Run [`verify_testing_setup.sql`](verify_testing_setup.sql) **alone** (not in the same tab as the apply script). You want:

- `handle_new_user` → starts with **OK:**
- `profiles_before_update` → starts with **OK:**
- `auth_trigger` → **OK:**
- `core_tables_rls` → **OK:**
- `workspace_currency` → **EUR**
- `one_open_timer_index`, `realtime_on_time_entries`, `clients_default_is_billable` → **true**

If you see `relation "new_workspace_id" does not exist`, update `verify_testing_setup.sql` from the repo (old version used `LIKE` patterns that Supabase misparsed).

## Step 4 — Refresh the app

Restart or hard-refresh the timetracker (`npm run dev` → http://localhost:3000).

---

## Already applied one migration?

If you only ran `20260515120000_clients_default_billable_unique_names.sql` before, running the bundle is still safe — it repeats that block with `if not exists`.

## Individual migration files

If you prefer to run files one-by-one from `supabase/migrations/`, use this order after `001_initial.sql`:

1. `20260210120000_time_entries_one_open_per_user.sql`
2. `20260513120000_handle_new_user_default_admin.sql`
3. `20260514120000_profiles_update_service_role_bypass.sql`
4. `20260515120000_clients_default_billable_unique_names.sql`
5. `20260516120000_workspace_currency_eur.sql`
6. `20260521120000_time_entries_realtime.sql`
