import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { brand } from "@/lib/brand";

function firstQueryString(
  v: string | string[] | undefined
): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const serverError = firstQueryString(searchParams.error);
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandLogo variant="compact" />
        <h1 className="text-xl font-semibold tracking-tight">
          {brand.productName} — Sign in
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {brand.companyName} team access.
        </p>
      </div>
      <LoginForm initialError={serverError ?? null} />
      <Link href="/" className="text-sm text-muted-foreground underline">
        Back to home
      </Link>
    </div>
  );
}
