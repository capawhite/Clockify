import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProjects, getWorkspaceContext } from "@/lib/auth/workspace";
import { DeleteClientForm } from "@/components/clients/delete-client-form";
import { translateFlashError } from "@/lib/i18n/flash-error";
import { createWorkspaceClient } from "./actions";

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const errKey = firstString(searchParams.err);
  const errDetail = firstString(searchParams.d);
  const flashError = await translateFlashError(errKey, errDetail);
  const { profile } = await getWorkspaceContext();
  const t = await getTranslations("clients");
  const supabase = createClient();

  const { data: clients, error: listError } = await supabase
    .from("clients")
    .select("id, name, color, created_at")
    .order("name");

  const canWrite = profile && canManageProjects(profile.role);
  const isAdmin = profile?.role === "admin";

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

      {listError ? (
        <p className="text-sm text-red-600">{listError.message}</p>
      ) : null}

      {canWrite ? (
        <form
          action={createWorkspaceClient}
          className="flex max-w-lg flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-medium">{t("addClient")}</h2>
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input
              name="name"
              required
              className="rounded border border-neutral-300 bg-white px-2 py-1.5 dark:border-neutral-600 dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("color")}
            <input
              name="color"
              type="color"
              defaultValue="#6366f1"
              className="h-9 w-16 cursor-pointer rounded border border-neutral-300 bg-white dark:border-neutral-600"
            />
          </label>
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t("saveClient")}
          </button>
        </form>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t("viewOnlyHint")}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          {t("sectionList", { count: clients?.length ?? 0 })}
        </h2>
        {!clients?.length ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {canWrite
              ? `${t("noClients")} ${t("addFirstAbove")}`
              : `${t("noClients")} ${t("noClientsReadOnly")}`}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {clients.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-neutral-300 dark:border-neutral-600"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                  <span className="font-medium">{c.name}</span>
                </div>
                {isAdmin ? <DeleteClientForm clientId={c.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm">
        <Link
          href="/projects"
          className="text-neutral-600 underline dark:text-neutral-400"
        >
          {t("goToProjectsLink")}
        </Link>
      </p>
    </div>
  );
}
