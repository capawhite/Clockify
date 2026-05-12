import { Link } from "@/i18n/navigation";
import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { translateFlashError } from "@/lib/i18n/flash-error";
import { assignProfileToWorkspace } from "./actions";

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const errKey = firstString(searchParams.err);
  const errDetail = firstString(searchParams.d);
  const flashError = await translateFlashError(errKey, errDetail);
  const { user, profile } = await getWorkspaceContext();
  const t = await getTranslations("team");

  if (!user || !profile?.workspace_id) {
    await localizedRedirect("/login");
    throw new Error("UNREACHABLE");
  }
  if (profile.role !== "admin") {
    await localizedRedirect("/clients");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();

  const { data: teammates, error: listErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, workspace_id, created_at")
    .order("created_at");

  const pending =
    teammates?.filter((p) => p.workspace_id === null && p.id !== user.id) ??
    [];
  const active =
    teammates?.filter(
      (p) => p.workspace_id === profile.workspace_id && p.id !== user.id
    ) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {t("subtitle")}
        </p>
      </div>

      {flashError ? (
        <p
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          {flashError}
        </p>
      ) : null}

      {listErr ? (
        <p className="text-sm text-red-600">{listErr.message}</p>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">
          {t("waitingSection", { count: pending.length })}
        </h2>
        {!pending.length ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t("waitingEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <span>
                  <strong>{p.full_name}</strong>
                  <span className="text-neutral-500"> · {p.id}</span>
                </span>
                <form action={assignProfileToWorkspace}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <button
                    type="submit"
                    className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    {t("addToWorkspace")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">
          {t("inWorkspaceSection", { count: active.length })}
        </h2>
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          <li className="px-3 py-2 text-sm">
            <strong>{t("youRow")}</strong> · {profile.role}
          </li>
          {active.map((p) => (
            <li key={p.id} className="px-3 py-2 text-sm">
              {p.full_name} · {p.role}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm">
        <Link
          href="/clients"
          className="text-neutral-600 underline dark:text-neutral-400"
        >
          {t("backClients")}
        </Link>
      </p>
    </div>
  );
}
