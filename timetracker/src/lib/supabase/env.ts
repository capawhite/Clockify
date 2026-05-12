/**
 * Supabase clients expect the project root only, e.g. `https://xxxx.supabase.co`.
 * If `NEXT_PUBLIC_SUPABASE_URL` was pasted as the REST base (`.../rest/v1`), auth
 * requests become `.../rest/v1/auth/v1/signup` and return 404.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let u = raw.trim();
  while (u.endsWith("/")) {
    u = u.slice(0, -1);
  }
  if (u.endsWith("/rest/v1")) {
    u = u.slice(0, -"/rest/v1".length);
  }
  if (u.endsWith("/rest")) {
    u = u.slice(0, -"/rest".length);
  }
  while (u.endsWith("/")) {
    u = u.slice(0, -1);
  }
  return u;
}

export function getSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }
  return { url: normalizeSupabaseUrl(rawUrl), anonKey };
}
