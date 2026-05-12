import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

function trimSecret(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  let s = v.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.length > 0 ? s : undefined;
}

/** Server-only Supabase client with the service role key. Never import from client components. */
export function getServiceRoleClient() {
  const rawUrl = trimSecret(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = trimSecret(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  );
  if (!rawUrl || !key) {
    return null;
  }
  const url = normalizeSupabaseUrl(rawUrl);
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
