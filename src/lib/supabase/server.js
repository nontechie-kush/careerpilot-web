/**
 * Supabase server client.
 * Use this in Server Components, API Routes, and middleware.
 * Reads/writes cookies for session management.
 *
 * Input:  Next.js cookies() from 'next/headers'
 * Output: Supabase client with the user's session context
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore.
            // Middleware handles session refresh.
          }
        },
      },
    },
  );
}

/**
 * Create a Supabase client from an incoming API request.
 * Supports BOTH cookie-based auth (web) and Bearer token auth (mobile).
 * Use this in API routes that need to serve both web and mobile clients.
 *
 * Priority: Bearer token > cookies
 */
export async function createClientFromRequest(request) {
  const authHeader = request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    // Mobile client — use the access token directly
    const { createClient: createBrowserClient } = await import('@supabase/supabase-js');
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        auth: { persistSession: false },
      },
    );
    return client;
  }

  // Web client — fall back to cookie-based auth
  return createClient();
}

/**
 * Service-role client for privileged operations (cron jobs, admin).
 * NEVER expose this to the client. Server-side only.
 */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false },
    },
  );
}
