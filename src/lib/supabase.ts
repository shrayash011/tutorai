import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Minimal interface satisfied by the resolved value of `await cookies()`
interface CookieStore {
  get(key: string): { value: string } | undefined;
}

// ── Browser client ─────────────────────────────────────────
// Singleton — safe to call in client components and hooks.

let browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createClient(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl),
    assertEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', supabaseAnonKey),
  );
  return browserClient;
}

// ── Server client (API routes / Server Components) ─────────
// In Next.js 15+, cookies() is async — callers must await it first:
//   const cookieStore = await cookies();
//   const supabase = createServerClient(cookieStore);
// RLS policies are enforced under the signed-in user's identity.

export function createServerClient(cookieStore: CookieStore): SupabaseClient {
  return createClient(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl),
    assertEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', supabaseAnonKey),
    {
      auth: {
        storage: {
          getItem: (key: string) => cookieStore.get(key)?.value ?? null,
          // Server is read-only; token refresh happens on the client.
          setItem: () => {},
          removeItem: () => {},
        },
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

// ── Service-role admin client ──────────────────────────────
// Bypasses RLS. Use ONLY in webhook handlers and server-side
// admin operations — never expose to the browser.

export function createAdminClient(): SupabaseClient {
  return createClient(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl),
    assertEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

// ── Auth helpers ───────────────────────────────────────────

/**
 * Returns the authenticated user from the server-side client,
 * or null if the request is unauthenticated.
 */
export async function getServerUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Returns the authenticated user and throws a 401 Response if
 * the request is unauthenticated. Use inside API route handlers.
 */
export async function requireServerUser() {
  const user = await getServerUser();
  if (!user) {
    throw Response.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}
