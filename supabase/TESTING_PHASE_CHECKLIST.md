# Testing phase: Supabase + Render checklist

Use this when **every new account should get a workspace and admin** (testing). Complexity usually comes from **migration drift** or **env pointing at the wrong Supabase project**.

## 1. Confirm database functions (Supabase SQL Editor)

Run the verification script (paste the whole file — **one result row** with all columns):

[`scripts/verify_testing_setup.sql`](scripts/verify_testing_setup.sql)

You want:

- `handle_new_user` starts with **OK:** (testing migration `20260513120000`)
- `profiles_before_update` starts with **OK:** (migration `20260514120000`)
- `auth_trigger` starts with **OK:**
- `core_tables_rls` = **OK: RLS enabled on core app tables** — if you see **WARN** here, RLS was skipped or tables were created without it; re-run [`001_initial.sql`](../migrations/001_initial.sql) RLS sections or enable RLS on those tables (the app assumes RLS + policies from that migration).

If any check fails, run the matching files under [`migrations/`](../migrations/) on **this** project (in order after `001_initial` if applicable):

1. `20260513120000_handle_new_user_default_admin.sql`
2. `20260514120000_profiles_update_service_role_bypass.sql`

## 2. Confirm Render (or host) environment

On the **same** Web Service that runs `npm run start`:

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL **without** `/rest/v1` suffix |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; required **at runtime** if you rely on app bootstrap when profiles lack `workspace_id` |

Verify:

- Hostname of `NEXT_PUBLIC_SUPABASE_URL` matches the project where you ran the SQL above.
- `SUPABASE_SERVICE_ROLE_KEY` is **not** build-only if your platform splits env scopes (e.g. Render: available to runtime).

Optional:

- `ENABLE_SERVICE_ROLE_WORKSPACE_BOOTSTRAP` — default **enabled** when unset. Set to `false` when DB migrations guarantee assignment and you want failures to surface without server-side promotion.

## 3. Diagnose a stuck user (profile row)

In Supabase SQL Editor (replace the UUID):

```sql
select id, workspace_id, role, full_name, is_active
from public.profiles
where id = 'PASTE_AUTH_USER_UUID_HERE';
```

Interpretation:

| `workspace_id` | `role` | Likely cause |
|----------------|--------|----------------|
| non-null | `admin` | Healthy for testing mode |
| **null** | `member` | Legacy `handle_new_user` or trigger failure; run `20260513120000` backfill section or rely on service-role bootstrap |
| row missing | — | Trigger missing or signup against another project |

Compare with the **red error text** on the home page (`workspaceAssignError`): it comes from Supabase API errors or missing service client.

## 4. Simplify operations

- Prefer **one source of truth**: keep `20260513120000` applied everywhere so **new** users never need the server bootstrap.
- Keep **`20260514120000`** applied so service-role updates are not reverted by `profiles_before_update`.
- Set `ENABLE_SERVICE_ROLE_WORKSPACE_BOOTSTRAP=false` only after you trust DB-only assignment.
