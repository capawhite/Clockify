import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { DashboardNav } from "@/components/dashboard-nav";
import {
  getWorkspaceContext,
  isWorkspaceProfileActive,
} from "@/lib/auth/workspace";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getWorkspaceContext();
  const t = await getTranslations("layout");
  const tCommon = await getTranslations("common");

  if (!user) {
    await localizedRedirect("/login");
    throw new Error("UNREACHABLE");
  }

  if (!profile?.workspace_id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center font-[family-name:var(--font-geist-sans)]">
        <h1 className="text-lg font-semibold">{t("noWorkspaceTitle")}</h1>
        <p className="max-w-md text-neutral-600 dark:text-neutral-400">
          {t("noWorkspaceBody")}
        </p>
        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-600"
          >
            {tCommon("home")}
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              {tCommon("signOut")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isWorkspaceProfileActive(profile)) {
    await localizedRedirect("/login?err=DEACTIVATED");
    throw new Error("UNREACHABLE");
  }

  return (
    <div
      className="min-h-screen font-[family-name:var(--font-geist-sans)]"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <DashboardNav
        showTeamLink={profile.role === "admin"}
        showAdminLink={profile.role === "admin"}
      />
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </div>
  );
}
