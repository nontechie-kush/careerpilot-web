/**
 * Dual-channel push utility — Web Push + Expo Push.
 *
 * sendPushToUser(userRow, payload) — sends via whichever channels the user has registered.
 *
 * Web Push: userRow must have push_endpoint, push_p256dh, push_auth_key
 * Expo Push: userRow must have expo_push_token (ExponentPushToken[...])
 *
 * payload: { title, body, action_url?, icon? }
 */

import webpush from 'web-push';
import { getVapidKeys } from './vapid';

let vapidInitialized = false;

function initVapid() {
  if (vapidInitialized) return;
  const { publicKey, privateKey, subject } = getVapidKeys();
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidInitialized = true;
}

/**
 * Send push via Expo Push API.
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */
async function sendExpoPush(expoPushToken, payload) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: { action_url: payload.action_url || null },
  };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expo Push API error: ${res.status} ${text}`);
  }
}

export async function sendPushToUser(userRow, payload) {
  const results = [];

  // Channel 1: Web Push (desktop browser)
  if (userRow.push_endpoint && userRow.push_p256dh && userRow.push_auth_key) {
    try {
      initVapid();
      const subscription = {
        endpoint: userRow.push_endpoint,
        keys: {
          p256dh: userRow.push_p256dh,
          auth: userRow.push_auth_key,
        },
      };
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      results.push({ channel: 'web', ok: true });
    } catch (err) {
      results.push({ channel: 'web', ok: false, error: err.message });
    }
  }

  // Channel 2: Expo Push (mobile app)
  if (userRow.expo_push_token) {
    try {
      await sendExpoPush(userRow.expo_push_token, payload);
      results.push({ channel: 'expo', ok: true });
    } catch (err) {
      results.push({ channel: 'expo', ok: false, error: err.message });
    }
  }

  if (results.length === 0) {
    throw new Error('User has no push subscription (web or mobile)');
  }

  return results;
}
