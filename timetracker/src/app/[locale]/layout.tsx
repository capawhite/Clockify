import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale, routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return children;
}
