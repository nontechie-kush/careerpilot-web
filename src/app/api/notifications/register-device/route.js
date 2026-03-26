import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

/**
 * POST /api/notifications/register-device
 *
 * Stores an Expo push token for the authenticated user.
 * Called by the mobile app on launch after login.
 *
 * Body: { expo_push_token: string, platform: 'ios' | 'android' }
 */
export async function POST(request) {
  const supabase = await createClientFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { expo_push_token, platform } = await request.json();

  if (!expo_push_token) {
    return NextResponse.json({ error: 'expo_push_token required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('users')
    .update({
      expo_push_token,
      device_platform: platform || null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to store push token:', error.message);
    return NextResponse.json({ error: 'Failed to store token' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
