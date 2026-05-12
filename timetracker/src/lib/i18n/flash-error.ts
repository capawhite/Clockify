import { getTranslations } from "next-intl/server";

export async function translateFlashError(
  errKey: string | undefined,
  detail?: string | undefined
): Promise<string | undefined> {
  if (!errKey) return undefined;
  const t = await getTranslations("errors");
  return t(errKey, { detail: detail ?? "" });
}
