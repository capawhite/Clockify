import { getLocale } from "next-intl/server";

/** POST target for `<form action={...}>` — must include `[locale]` segment. */
export async function getSignOutActionPath(): Promise<string> {
  const locale = await getLocale();
  return `/${locale}/auth/signout`;
}
