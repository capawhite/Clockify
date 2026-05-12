"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

const COOKIE = "NEXT_LOCALE";
const MAX_AGE = 60 * 60 * 24 * 365;

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("lang");

  function setLocale(next: "en" | "es") {
    document.cookie = `${COOKIE}=${next};path=/;max-age=${MAX_AGE};SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
      <span className="text-muted-foreground sr-only sm:not-sr-only">
        {t("label")}
      </span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={
          locale === "en"
            ? "font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }
      >
        {t("en")}
      </button>
      <span className="text-muted-foreground">|</span>
      <button
        type="button"
        onClick={() => setLocale("es")}
        className={
          locale === "es"
            ? "font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }
      >
        {t("es")}
      </button>
    </div>
  );
}
