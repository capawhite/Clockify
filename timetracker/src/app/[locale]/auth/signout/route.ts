import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Public URL the browser should load after sign-out. Uses proxy headers when
 * present so `Location` matches the tunnel/host the user actually opened (e.g.
 * Cursor on https://localhost:10000) instead of the Node-internal origin.
 */
function redirectOrigin(request: Request): string {
  const h = headers();
  const forwardedHost = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabaseEnv();

  const origin = redirectOrigin(request);
  const response = NextResponse.redirect(new URL("/login", origin));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headerBag) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        if (headerBag && typeof headerBag === "object") {
          Object.entries(headerBag).forEach(([key, value]) => {
            if (typeof value === "string") {
              response.headers.set(key, value);
            }
          });
        }
      },
    },
  });

  await supabase.auth.signOut();
  return response;
}
