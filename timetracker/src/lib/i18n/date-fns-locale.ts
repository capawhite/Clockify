import { enUS, es } from "date-fns/locale";

export function getDateFnsLocale(locale: string) {
  return locale === "es" ? es : enUS;
}
