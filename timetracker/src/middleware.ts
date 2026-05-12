import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  const { supabase, response: supaResponse } = updateSession(request);
  await supabase.auth.getUser();

  supaResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie);
  });

  return intlResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_vercel|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
