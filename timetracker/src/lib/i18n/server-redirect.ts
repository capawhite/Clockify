import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/** next-intl `redirect` requires `locale` when called from the server. */
export async function localizedRedirect(href: string): Promise<never> {
  const locale = await getLocale();
  redirect({ href, locale });
  throw new Error("UNREACHABLE");
}
