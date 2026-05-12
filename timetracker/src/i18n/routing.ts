import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "never",
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    path: "/",
  },
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(
  locale: string | undefined
): locale is AppLocale {
  return (
    typeof locale === "string" &&
    (routing.locales as readonly string[]).includes(locale)
  );
}
