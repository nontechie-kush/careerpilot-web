import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';

/**
 * GET /api/app-config
 *
 * Returns mobile app configuration including remote kill switch for WebView automation.
 * The mobile app checks this on launch — if webview automation is disabled for the platform,
 * the app falls back to manual outreach (copy + open LinkedIn app).
 *
 * No auth required — config is public.
 */
export async function GET(request) {
  const supabase = await createClientFromRequest(request);

  // Try to read from app_config table (may not exist yet)
  const { data } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', ['ios_webview_enabled', 'android_webview_enabled', 'min_app_version']);

  const config = {};
  if (data) {
    for (const row of data) {
      config[row.key] = row.value;
    }
  }

  return NextResponse.json({
    ios_webview: config.ios_webview_enabled !== 'false',   // default: enabled
    android_webview: config.android_webview_enabled !== 'false', // default: enabled
    min_version: config.min_app_version || '1.0.0',
  });
}
