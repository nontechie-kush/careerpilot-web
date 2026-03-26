/**
 * GET /api/auth/token
 * Returns the current user's access token (for injecting into the Chrome extension).
 */
import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const supabase = await createClientFromRequest(request);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ access_token: session.access_token });
}
