# TimeTracker — Product Specification
_A self-hosted, multi-user time tracking app. Clockify replacement._

---

## 1. Overview

A lightweight web app for small teams to track time by project and task, with reporting dashboards. Self-hosted on Render.com, backed by Supabase. No seat-based pricing — own your data.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL + Auth) |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Deployment | Render.com (web service) |
| Auth | Supabase Auth (email/password + magic link) |

---

## 3. Roles & Permissions

| Role | Capabilities |
|---|---|
| **Admin** | Full access: manage users, projects, clients. View all reports. Edit/delete any entry. |
| **Manager** | View reports for assigned projects and their team members. Cannot manage users. |
| **Member** | Track own time. View own reports. Cannot see other users' data. |

Roles are set per-workspace (a single deployment = one workspace for a small team).

---

## 4. Data Model

### `workspaces`
- `id`, `name`, `created_at`

### `users` (extends Supabase auth.users)
- `id`, `workspace_id`, `full_name`, `role` (admin | manager | member), `avatar_url`, `is_active`

### `clients`
- `id`, `workspace_id`, `name`, `color`

### `projects`
- `id`, `workspace_id`, `client_id` (nullable), `name`, `color`, `hourly_rate` (nullable), `is_billable`, `is_archived`, `created_at`

### `tasks`
- `id`, `project_id`, `name`, `is_archived`

### `time_entries`
- `id`, `user_id`, `project_id`, `task_id` (nullable), `description`, `started_at` (timestamptz), `ended_at` (timestamptz, nullable — null = currently running), `duration_seconds` (computed), `is_billable`, `tags[]`, `created_at`

### `tags`
- `id`, `workspace_id`, `name`, `color`

---

## 5. Features

### 5.1 Time Tracking

**Timer mode**
- One-click start/stop timer on the main tracker bar
- Running timer persists across page refreshes (stored in DB with `ended_at = null`)
- Only one active timer per user at a time (starting a new one stops the previous)
- Live elapsed time display (HH:MM:SS)

**Manual entry mode**
- Toggle between Timer and Manual on the tracker bar
- Pick start time, end time → calculates duration
- Date picker defaults to today

**Entry fields (both modes)**
- Description (free text, optional)
- Project selector (required or optional, configurable)
- Task selector (depends on project)
- Billable toggle (inherits project default)
- Tags (multi-select)

**Inline editing**
- Click any past entry to edit description, project, task, time range
- Bulk actions: delete selected entries, move to project, add tag

---

### 5.2 Weekly Timesheet View

- Calendar grid: rows = days of week, grouped entries per day
- Total hours per day + week total in header
- Navigate forward/back by week
- Expandable day rows

---

### 5.3 Projects

- Create / archive projects
- Assign client, color, default billable flag, hourly rate
- Project members (which users can log to this project)
- Per-project progress bar if a time budget is set (hours target)

---

### 5.4 Reports

All reports are filterable by:
- Date range (presets: today, this week, last week, this month, last month, custom)
- User(s)
- Project(s)
- Client(s)
- Billable / non-billable
- Tags

#### Summary Report
- Total hours tracked
- Billable vs non-billable split (hours + %)
- Billable amount (if hourly rates set)

#### By-User Report
- Table + bar chart: hours per user
- Sortable by name, hours, billable hours

#### By-Project Report
- Table + bar chart: hours per project
- With client grouping option
- Progress vs budget if set

#### By-Client Report
- Grouped by client → projects → total hours

#### Detailed Report (raw entries)
- Full log: date, user, project, task, description, duration, billable
- CSV export
- PDF export (basic)

#### Time Distribution Chart
- Stacked bar chart by day showing hours per project
- Switchable to pie chart for the selected range

---

### 5.5 Dashboard (Home)

- Today's tracked time
- This week's tracked time vs same week last week
- Active timer card (if running)
- Quick-start: resume recent entries with one click
- Top 5 projects this week (mini bar chart)
- Team activity feed (admin/manager only): who's tracking right now

---

### 5.6 Admin Panel

- User management: invite by email, set role, deactivate
- Project management (same as Projects but for all users)
- Workspace settings: name, timezone, week start day (Mon/Sun), currency
- Data export: full CSV dump of all entries

---

## 6. UI/UX Requirements

- Dark mode / light mode toggle (respects system preference by default)
- Responsive: works on tablet and mobile (timer + entry log minimum)
- Keyboard shortcut: `Space` to start/stop timer on tracker page
- Loading skeletons on data-heavy pages (reports)
- Toast notifications for actions (entry saved, timer stopped, etc.)
- Empty states with helpful CTAs (no projects? → "Create your first project")

---

## 7. Auth Flow

1. Admin creates workspace on first run (seed script or first-user-is-admin logic)
2. Admin invites teammates by email → Supabase sends magic link
3. User sets password on first login
4. Session managed by Supabase Auth (JWT, httpOnly cookie via Next.js middleware)
5. RLS (Row Level Security) enforced at DB level per workspace and role

---

## 8. Supabase RLS Policy Summary

- Users can only read/write `time_entries` where `user_id = auth.uid()` (members)
- Managers can read entries for projects they manage
- Admins can read/write all rows in their `workspace_id`
- All tables filtered by `workspace_id` to support future multi-tenancy

---

## 9. Render Deployment

```yaml
# render.yaml
services:
  - type: web
    name: timetracker
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start
    envVars:
      - key: NEXT_PUBLIC_SUPABASE_URL
        sync: false
      - key: NEXT_PUBLIC_SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: NEXTAUTH_SECRET
        generateValue: true
```

Set env vars in Render dashboard. Supabase project can be the existing one or a new project (recommended: separate project for clean separation).

---

## 10. MVP Scope (Phase 1)

Build these first, in order:

1. Auth (invite, login, roles)
2. Projects + Clients CRUD
3. Timer + manual entry on tracker page
4. Entry list with inline edit/delete
5. Weekly timesheet view
6. Summary + By-Project + By-User reports
7. CSV export
8. Dashboard

**Phase 2 (later):**
- PDF export
- Tags
- Tasks within projects
- Time budgets / project targets
- Integrations (Zapier, Make.com webhook on entry stop)

---

## 11. Cursor Prompting Strategy

1. Paste this spec into `.cursor/rules/timetracker.md`
2. Start with DB schema: *"Generate the full Supabase SQL migration for the schema in the spec, with RLS policies"*
3. Then scaffold: *"Create the Next.js 14 App Router project structure with shadcn/ui, following the spec"*
4. Build feature by feature: auth → projects → timer → reports
5. Use Claude Code for cross-cutting refactors once the codebase grows

---

_Generated: May 2026_
