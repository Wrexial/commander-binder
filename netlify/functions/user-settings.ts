import type { HandlerEvent } from '@netlify/functions';
import { getUserId, unauthorized } from '../utils/auth';
import { badRequest, parseJsonBody } from '../utils/request';
import {
  MAX_SETTINGS_BYTES,
  isValidSettings,
  isWithinLimit,
  loadSettings,
  saveSettings,
} from '../utils/userSettings';

/**
 * Per-account UI preferences, so tooltip/display settings follow a collector
 * across devices. GET loads them; PUT replaces them.
 */
export async function handler(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  if (event.httpMethod === 'GET') {
    const settings = await loadSettings(userId);
    return { statusCode: 200, body: JSON.stringify({ settings }) };
  }

  if (event.httpMethod !== 'PUT' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const { settings } = parsed.value;
  if (!isValidSettings(settings)) {
    return badRequest("'settings' must be an object.");
  }
  if (!isWithinLimit(settings)) {
    return badRequest(`'settings' must serialize to at most ${MAX_SETTINGS_BYTES} bytes.`);
  }

  await saveSettings(userId, settings);
  return { statusCode: 200, body: JSON.stringify({ settings }) };
}
