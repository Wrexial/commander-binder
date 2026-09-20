// netlify/utils/request.ts

/** Minimal slice of a Netlify event this helper needs (keeps it easy to test). */
type JsonEvent = { body?: string | null };

/** Upper bound on a single batch toggle so one request can't fan out unbounded. */
export const MAX_BATCH_SIZE = 500;

export type HandlerResponse = { statusCode: number; body: string };

/** Standard 400 response carrying a human-readable reason. */
export function badRequest(message = 'Bad Request'): HandlerResponse {
  return { statusCode: 400, body: JSON.stringify({ message }) };
}

export type JsonBody =
  { ok: true; value: Record<string, unknown> } | { ok: false; response: HandlerResponse };

/**
 * Parse a Netlify event's JSON body without throwing. A missing body becomes an
 * empty object; malformed JSON or a non-object payload returns a 400 response
 * the caller can forward directly. Callers are still responsible for validating
 * individual fields, since every value here is `unknown`.
 */
export function parseJsonBody(event: JsonEvent): JsonBody {
  if (!event.body) return { ok: true, value: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    return { ok: false, response: badRequest('Malformed JSON body.') };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, response: badRequest('Expected a JSON object.') };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}
