import {
  BarChart3,
  Calendar,
  Clock,
  FolderKanban,
  LayoutDashboard,
  Shield,
  Users,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getSignOutActionPath } from "@/lib/i18n/signout-action";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tAuth = await getTranslations("auth");
  const tHome = await getTranslations("home");
  const tNav = await getTranslations("nav");
  const tCommon = await getTranslations("common");
  const signOutAction = await getSignOutActionPath();
  const { user, profile, workspaceAssignError } = await getWorkspaceContext();

  const inWorkspace = Boolean(profile?.workspace_id);
  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="min-w-0 shrink transition-opacity hover:opacity-90"
          >
            <BrandLogo variant="compact" withLink={false} />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <form action={signOutAction} method="post">
                <Button type="submit" variant="ghost" size="sm">
                  {tCommon("signOut")}
                </Button>
              </form>
            ) : null}
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-muted/50 via-background to-background"
          aria-hidden
        />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-8 text-center sm:mb-10">
            <BrandLogo variant="hero" className="mx-auto justify-center" withLink={false} />
            <h1 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {brand.productName}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              {brand.tagline}
            </p>
            <a
              href={brand.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {tAuth("websiteLink", { company: brand.companyName })}
            </a>
          </div>

          {user ? (
            <div className="mx-auto w-full max-w-4xl space-y-6">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <p className="text-sm font-medium text-foreground">
                  {tHome("signedInAs", { email: user.email ?? "" })}
                </p>
                {profile?.full_name || profile?.role ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {profile?.full_name ? (
                      <span className="font-medium text-foreground/90">
                        {profile.full_name}
                      </span>
                    ) : null}
                    {profile?.full_name && profile?.role ? (
                      <span aria-hidden> · </span>
                    ) : null}
                    {profile?.role ? (
                      <span className="capitalize">{profile.role}</span>
                    ) : null}
                  </p>
                ) : null}
              </div>

              {inWorkspace ? (
                <>
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      {tHome("menuTitle")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tHome("menuSubtitle")}
                    </p>
                    <ul className="mt-5 grid list-none grid-cols-2 gap-2 sm:grid-cols-4">
                      <li>
                        <Link
                          href="/dashboard"
                          className={cn(
                            buttonVariants({ variant: "default", size: "default" }),
                            "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold shadow-sm sm:gap-3 sm:px-4 sm:text-base"
                          )}
                        >
                          <LayoutDashboard
                            className="size-5 shrink-0 opacity-90"
                            aria-hidden
                          />
                          <span className="leading-tight">
                            {tNav("dashboard")}
                          </span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/tracker"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "default" }),
                            "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 border-border/80 bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/40 sm:gap-3 sm:px-4 sm:text-base"
                          )}
                        >
                          <Clock className="size-5 shrink-0" aria-hidden />
                          <span className="leading-tight">
                            {tNav("timer")}
                          </span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/calendar"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "default" }),
                            "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 border-border/80 bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/40 sm:gap-3 sm:px-4 sm:text-base"
                          )}
                        >
                          <Calendar className="size-5 shrink-0" aria-hidden />
                          <span className="leading-tight">
                            {tNav("calendar")}
                          </span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/clients"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "default" }),
                            "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 border-border/80 bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/40 sm:gap-3 sm:px-4 sm:text-base"
                          )}
                        >
                          <Users className="size-5 shrink-0" aria-hidden />
                          <span className="leading-tight">
                            {tNav("clients")}
                          </span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/projects"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "default" }),
                            "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 border-border/80 bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/40 sm:gap-3 sm:px-4 sm:text-base"
                          )}
                        >
                          <FolderKanban
                            className="size-5 shrink-0"
                            aria-hidden
                          />
                          <span className="leading-tight">
                            {tNav("projects")}
                          </span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/reports"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "default" }),
                            "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 border-border/80 bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/40 sm:gap-3 sm:px-4 sm:text-base"
                          )}
                        >
                          <BarChart3 className="size-5 shrink-0" aria-hidden />
                          <span className="leading-tight">
                            {tNav("reports")}
                          </span>
                        </Link>
                      </li>
                      {isAdmin ? (
                        <>
                          <li>
                            <Link
                              href="/admin"
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "default",
                                }),
                                "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 border-border/80 bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/40 sm:gap-3 sm:px-4 sm:text-base"
                              )}
                            >
                              <Shield
                                className="size-5 shrink-0"
                                aria-hidden
                              />
                              <span className="leading-tight">
                                {tNav("admin")}
                              </span>
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/team"
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "default",
                                }),
                                "inline-flex h-auto min-h-11 w-full flex-row items-center gap-2 border-border/80 bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/40 sm:gap-3 sm:px-4 sm:text-base"
                              )}
                            >
                              <UsersRound
                                className="size-5 shrink-0"
                                aria-hidden
                              />
                              <span className="leading-tight">
                                {tNav("team")}
                              </span>
                            </Link>
                          </li>
                        </>
                      ) : null}
                    </ul>
                  </div>

                  <form action={signOutAction} method="post" className="pt-2">
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full border-dashed sm:w-auto"
                    >
                      {tCommon("signOut")}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="space-y-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-5 py-4 text-center text-sm text-foreground dark:border-amber-400/20 dark:bg-amber-400/10">
                  <p className="text-muted-foreground">
                    {tAuth("waitingWorkspace")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tHome("workspaceAssignHint")}
                  </p>
                  {workspaceAssignError ? (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/5 p-3 text-left text-xs text-destructive">
                      {workspaceAssignError}
                    </pre>
                  ) : null}
                  <form action={signOutAction} method="post">
                    <Button type="submit" variant="outline" size="sm">
                      {tCommon("signOut")}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-md space-y-6 text-center">
              <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                <h2 className="text-xl font-semibold tracking-tight">
                  {tHome("guestTitle")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {tHome("guestSubtitle")}
                </p>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "mt-6 inline-flex w-full justify-center"
                  )}
                >
                  {tAuth("goToLogin")}
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAuth("notSignedIn")}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
