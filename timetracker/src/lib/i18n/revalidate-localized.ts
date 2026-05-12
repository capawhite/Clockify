import { revalidatePath } from "next/cache";
import { routing } from "@/i18n/routing";

/**
 * Revalidates a user-visible path for every supported locale (internal
 * `/{locale}/...` segments when using next-intl with `localePrefix: 'never'`).
 */
export function revalidateLocalizedPath(visiblePath: string) {
  const normalized = visiblePath.startsWith("/")
    ? visiblePath.slice(1)
    : visiblePath;
  for (const locale of routing.locales) {
    const internal = normalized ? `/${locale}/${normalized}` : `/${locale}`;
    revalidatePath(internal);
  }
}
