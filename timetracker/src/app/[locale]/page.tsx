import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { brand } from "@/lib/brand";

export default async function Home() {
  const supabase = createClient();
  const tAuth = await getTranslations("auth");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("workspace_id, role, full_name")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const inWorkspace = Boolean(profile?.workspace_id);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 font-[family-name:var(--font-geist-sans)] text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <main className="flex max-w-lg flex-col items-center gap-5 text-center">
        <BrandLogo variant="hero" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {brand.productName}
          </h1>
          <p className="text-sm text-muted-foreground">{brand.tagline}</p>
          <a
            href={brand.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {brand.companyName} — area10marketing.com
          </a>
        </div>
        {user ? (
          <>
            <p className="text-neutral-700 dark:text-neutral-300">
              Signed in as <strong>{user.email}</strong>
              {profile?.full_name ? (
                <>
                  {" "}
                  ({profile.full_name}
                  {profile.role ? ` · ${profile.role}` : ""})
                </>
              ) : null}
            </p>
            {inWorkspace ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  href="/dashboard"
                  className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
                >
                  Dashboard
                </Link>
                <Link
                  href="/tracker"
                  className="rounded border border-border px-4 py-2 text-sm"
                >
                  Timer
                </Link>
                <Link
                  href="/clients"
                  className="rounded border border-border px-4 py-2 text-sm"
                >
                  Clients
                </Link>
                <Link
                  href="/projects"
                  className="rounded border border-border px-4 py-2 text-sm"
                >
                  Projects
                </Link>
                <Link
                  href="/reports"
                  className="rounded border border-border px-4 py-2 text-sm"
                >
                  Reports
                </Link>
                {profile?.role === "admin" ? (
                  <>
                    <Link
                      href="/admin"
                      className="rounded border border-border px-4 py-2 text-sm"
                    >
                      Admin
                    </Link>
                    <Link
                      href="/team"
                      className="rounded border border-border px-4 py-2 text-sm"
                    >
                      Team
                    </Link>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Waiting for workspace assignment from an admin.
              </p>
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-600"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-neutral-700 dark:text-neutral-300">
              {tAuth("notSignedIn")}
            </p>
            <Link
              href="/login"
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Go to login
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
