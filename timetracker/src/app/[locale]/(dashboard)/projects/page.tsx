import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProjects, getWorkspaceContext } from "@/lib/auth/workspace";
import { ProjectsSuccessToast } from "@/components/projects/projects-success-toast";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { translateFlashError } from "@/lib/i18n/flash-error";
import { createProject, setProjectArchived } from "./actions";

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const errKey = firstString(searchParams.err);
  const errDetail = firstString(searchParams.d);
  const flashError = await translateFlashError(errKey, errDetail);
  const toastKey = firstString(searchParams.toast);
  const { profile } = await getWorkspaceContext();
  const t = await getTranslations("projects");
  const supabase = createClient();

  const { data: clientList } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");

  const { data: projects, error: listError } = await supabase
    .from("projects")
    .select(
      "id, name, color, is_billable, is_archived, hourly_rate, client_id, created_at"
    )
    .order("name");

  const canWrite = profile && canManageProjects(profile.role);

  return (
    <div className="flex flex-col gap-8">
      <ProjectsSuccessToast toastKey={toastKey} />
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
          id="add-project"
          action={createProject}
          className="flex max-w-lg flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-medium">{t("addProject")}</h2>
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input
              name="name"
              required
              className="rounded border border-neutral-300 bg-white px-2 py-1.5 dark:border-neutral-600 dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("clientOptional")}
            <select
              name="client_id"
              className="rounded border border-neutral-300 bg-white px-2 py-1.5 dark:border-neutral-600 dark:bg-neutral-900"
              defaultValue=""
            >
              <option value="">{t("clientOptionNone")}</option>
              {clientList?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
          <label className="flex items-center gap-2 text-sm">
            <input name="is_billable" type="checkbox" defaultChecked />
            {t("billableDefault")}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("hourlyRate")}
            <input
              name="hourly_rate"
              type="number"
              step="0.01"
              min="0"
              placeholder={t("ratePlaceholder")}
              className="rounded border border-neutral-300 bg-white px-2 py-1.5 dark:border-neutral-600 dark:bg-neutral-900"
            />
          </label>
          <button
            type="submit"
            className="w-fit rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t("saveProject")}
          </button>
        </form>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t("viewOnlyHint")}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          {t("sectionAll", { count: projects?.length ?? 0 })}
        </h2>
        {!projects?.length ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {t("noProjectsTitle")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {canWrite ? t("noProjectsCanWrite") : t("noProjectsReadOnly")}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {canWrite ? (
                <a href="#add-project" className={cn(buttonVariants())}>
                  {t("addAProject")}
                </a>
              ) : null}
              <Link
                href="/tracker"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("openTimer")}
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {projects.map((p) => {
              const clientName = clientList?.find((c) => c.id === p.client_id)
                ?.name;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-neutral-300 dark:border-neutral-600"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    />
                    <span className="font-medium">{p.name}</span>
                    {p.is_archived ? (
                      <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
                        {t("archived")}
                      </span>
                    ) : null}
                    {!p.is_billable ? (
                      <span className="text-xs text-neutral-500">
                        {t("nonBillable")}
                      </span>
                    ) : null}
                    {clientName ? (
                      <span className="text-xs text-neutral-500">
                        {t("clientLabel", { name: clientName })}
                      </span>
                    ) : null}
                    {p.hourly_rate != null ? (
                      <span className="text-xs text-neutral-500">
                        {t("rateShort", {
                          rate: Number(p.hourly_rate).toFixed(2),
                        })}
                      </span>
                    ) : null}
                  </div>
                  {canWrite ? (
                    <form action={setProjectArchived} className="shrink-0">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        type="hidden"
                        name="archived"
                        value={p.is_archived ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="text-xs text-neutral-600 underline dark:text-neutral-400"
                      >
                        {p.is_archived ? t("restore") : t("archive")}
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-sm">
        <Link
          href="/clients"
          className="text-neutral-600 underline dark:text-neutral-400"
        >
          {t("backToClients")}
        </Link>
      </p>
    </div>
  );
}
