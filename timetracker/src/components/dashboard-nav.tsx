import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export async function DashboardNav({
  showTeamLink,
  showAdminLink,
}: {
  showTeamLink?: boolean;
  showAdminLink?: boolean;
}) {
  const t = await getTranslations("nav");

  return (
    <header className="border-b bg-background">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3 text-sm font-medium">
        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <BrandLogo variant="compact" className="mr-1" href="/dashboard" />
          <Link href="/" className="text-muted-foreground">
            {t("home")}
          </Link>
          <Link href="/dashboard">{t("dashboard")}</Link>
          <Link href="/tracker">{t("timer")}</Link>
          <Link href="/calendar">{t("calendar")}</Link>
          <Link href="/clients">{t("clients")}</Link>
          <Link href="/projects">{t("projects")}</Link>
          <Link href="/reports">{t("reports")}</Link>
          {showAdminLink ? <Link href="/admin">{t("admin")}</Link> : null}
          {showTeamLink ? <Link href="/team">{t("team")}</Link> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
