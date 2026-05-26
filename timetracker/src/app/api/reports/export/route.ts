import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getWorkspaceContext,
  isWorkspaceProfileActive,
} from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { aggregateByUser, summarizeEntries } from "@/lib/reports/aggregate";
import {
  buildCsvFromMatrix,
  buildEntryExportMatrix,
  buildExcelBuffer,
  buildExportLabels,
} from "@/lib/reports/export-data";
import { fetchReportData } from "@/lib/reports/fetch-report-entries-query";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function firstString(v: string | null): string | undefined {
  if (v == null || v === "") return undefined;
  return v;
}

export async function GET(request: Request) {
  const { user, profile } = await getWorkspaceContext();
  if (!user?.id || !profile?.workspace_id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isWorkspaceProfileActive(profile)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const localeParam = url.searchParams.get("locale");
  const locale =
    localeParam && routing.locales.includes(localeParam as "en" | "es")
      ? localeParam
      : routing.defaultLocale;

  const supabase = createClient();
  const data = await fetchReportData(
    supabase,
    user,
    { ...profile, workspace_id: profile.workspace_id },
    {
    from: firstString(url.searchParams.get("from")),
    to: firstString(url.searchParams.get("to")),
    user: firstString(url.searchParams.get("user")),
    project: firstString(url.searchParams.get("project")),
    billable: firstString(url.searchParams.get("billable")),
    }
  );

  const t = await getTranslations({ locale, namespace: "reports" });
  const labels = buildExportLabels((key) => t(key));
  const money = new Intl.NumberFormat(locale === "es" ? "es" : "en-US", {
    style: "currency",
    currency: data.currency,
    maximumFractionDigits: 2,
  });

  const summary = summarizeEntries(data.entries);
  const byUser = data.canFilterTeam
    ? aggregateByUser(data.entries, new Map(Object.entries(data.nameByUserId)))
    : null;

  const exportOpts = {
    nameByUserId: data.nameByUserId,
    timeZone: data.timeZone,
    locale,
    labels,
    money,
  };

  const baseName = `time-report_${data.params.from}_to_${data.params.to}`;
  const truncatedSuffix = data.truncated ? "-partial" : "";

  if (format === "xlsx") {
    const buffer = buildExcelBuffer(data.entries, {
      ...exportOpts,
      summary,
      byUser,
    });
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}${truncatedSuffix}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const matrix = buildEntryExportMatrix(data.entries, exportOpts);
  const csv = buildCsvFromMatrix(matrix);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}${truncatedSuffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
