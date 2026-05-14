"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminProfileActiveSwitch } from "@/components/admin/admin-profile-active-switch";
import {
  assignProfileToWorkspaceAdmin,
  inviteUserByEmail,
  updateMemberRole,
  updateWorkspaceSettings,
} from "@/app/[locale]/(dashboard)/admin/actions";
import { brand } from "@/lib/brand";

type WorkspaceRow = {
  id: string;
  name: string;
  timezone: string;
  week_starts_on: string;
  currency: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
  workspace_id: string | null;
  is_active: boolean;
};

const COMMON_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "INR",
  "MXN",
  "BRL",
];

type Tab = "users" | "settings" | "export";

function roleBadgeClass(role: string): string {
  if (role === "admin") {
    return "bg-primary/15 text-primary border border-primary/30";
  }
  if (role === "manager") {
    return "bg-secondary text-secondary-foreground border border-border";
  }
  return "bg-muted text-muted-foreground border border-border";
}

export function AdminPanel({
  workspace,
  pending,
  members,
  currentUserId,
  timezones,
  invitesConfigured,
  flashError,
  flashOk,
}: {
  workspace: WorkspaceRow;
  pending: ProfileRow[];
  members: ProfileRow[];
  currentUserId: string;
  timezones: string[];
  invitesConfigured: boolean;
  flashError?: string;
  flashOk?: boolean;
}) {
  const t = useTranslations("admin");
  const tNav = useTranslations("nav");
  const [tab, setTab] = useState<Tab>("users");

  const tzOptions = useMemo(() => {
    const set = new Set(timezones);
    if (!set.has(workspace.timezone)) {
      return [workspace.timezone, ...timezones];
    }
    return timezones;
  }, [timezones, workspace.timezone]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { company: brand.companyName })}
        </p>
      </div>

      {flashError ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {flashError}
        </p>
      ) : null}
      {flashOk ? (
        <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          {t("savedOk")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border pb-1">
        {(
          [
            { id: "users" as const, label: t("tabUsers") },
            { id: "settings" as const, label: t("tabSettings") },
            { id: "export" as const, label: t("tabExport") },
          ] as const
        ).map((tabItem) => (
          <Button
            key={tabItem.id}
            type="button"
            size="sm"
            variant={tab === tabItem.id ? "default" : "ghost"}
            className="rounded-b-none"
            onClick={() => setTab(tabItem.id)}
          >
            {tabItem.label}
          </Button>
        ))}
      </div>

      {tab === "users" ? (
        <div className="space-y-10">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("inviteSectionTitle")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("inviteSectionHelp")}
            </p>
            {!invitesConfigured ? (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t("invitesNotConfigured")}
              </p>
            ) : null}
            <form action={inviteUserByEmail} className="flex max-w-md flex-wrap gap-2">
              <Input
                name="email"
                type="email"
                required
                placeholder="colleague@company.com"
                disabled={!invitesConfigured}
                className="min-w-[200px] flex-1"
              />
              <Button type="submit" disabled={!invitesConfigured}>
                Invite
              </Button>
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              {t("waitingHeading", { count: pending.length })}
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("waitingEmpty")}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pending.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{p.full_name || "Unnamed"}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{p.id}</span>
                    </div>
                    <form action={assignProfileToWorkspaceAdmin}>
                      <input type="hidden" name="profile_id" value={p.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        {t("addToWorkspace")}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              {t("membersHeading", { count: members.length })}
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="p-3 font-medium">{t("tableName")}</th>
                    <th className="p-3 font-medium">{t("tableRole")}</th>
                    <th className="p-3 font-medium">{t("tableRoleEditor")}</th>
                    <th className="p-3 font-medium">{t("tableActive")}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="font-medium">{p.full_name || "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground">{p.id}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadgeClass(p.role)}`}
                        >
                          {p.role}
                        </span>
                      </td>
                      <td className="p-3">
                        <form
                          action={updateMemberRole}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="profile_id" value={p.id} />
                          <select
                            name="role"
                            defaultValue={p.role}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="member">Member</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                          <Button type="submit" size="sm" variant="outline">
                            {t("saveRole")}
                          </Button>
                        </form>
                      </td>
                      <td className="p-3">
                        {p.id === currentUserId ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <AdminProfileActiveSwitch
                            key={`${p.id}-${p.is_active}`}
                            profileId={p.id}
                            initiallyActive={p.is_active}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-sm text-muted-foreground">
            <Link href="/team" className="underline">
              {tNav("team")}
            </Link>{" "}
            {t("teamLinkLead")}
          </p>
        </div>
      ) : null}

      {tab === "settings" ? (
        <section className="max-w-lg space-y-4">
          <h2 className="text-sm font-semibold">Workspace</h2>
          <form action={updateWorkspaceSettings} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input
                id="ws-name"
                name="name"
                required
                defaultValue={workspace.name}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-tz">Timezone</Label>
              <select
                id="ws-tz"
                name="timezone"
                defaultValue={workspace.timezone}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Week starts on</span>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="week_starts_on"
                    value="mon"
                    defaultChecked={workspace.week_starts_on === "mon"}
                  />
                  Monday
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="week_starts_on"
                    value="sun"
                    defaultChecked={workspace.week_starts_on === "sun"}
                  />
                  Sunday
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-cur">Currency (ISO 4217)</Label>
              <Input
                id="ws-cur"
                name="currency"
                required
                defaultValue={workspace.currency}
                maxLength={3}
                minLength={3}
                pattern="[A-Za-z]{3}"
                className="max-w-[120px] uppercase"
                list="currency-list"
              />
              <datalist id="currency-list">
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Button type="submit">Save workspace settings</Button>
          </form>
        </section>
      ) : null}

      {tab === "export" ? (
        <section className="max-w-lg space-y-4">
          <h2 className="text-sm font-semibold">Time entries export</h2>
          <p className="text-sm text-muted-foreground">
            Download a CSV of every time entry on projects in this workspace (all
            users). Open timers include blank duration until stopped.
          </p>
          <a
            href="/api/admin/time-entries-csv"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Download CSV
          </a>
        </section>
      ) : null}
    </div>
  );
}
