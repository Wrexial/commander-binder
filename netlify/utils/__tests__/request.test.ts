import { describe, it, expect } from 'vitest';
import { badRequest, parseJsonBody } from '../request';

describe('parseJsonBody', () => {
  it('treats a missing body as an empty object', () => {
    expect(parseJsonBody({ body: null })).toEqual({ ok: true, value: {} });
    expect(parseJsonBody({})).toEqual({ ok: true, value: {} });
  });

  it('parses a JSON object', () => {
    expect(parseJsonBody({ body: '{"cardId":"abc","isOwned":true}' })).toEqual({
      ok: true,
      value: { cardId: 'abc', isOwned: true },
    });
  });

  it('returns a 400 for malformed JSON instead of throwing', () => {
    const result = parseJsonBody({ body: '{not json' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.statusCode).toBe(400);
      expect(JSON.parse(result.response.body).message).toBe('Malformed JSON body.');
    }
  });

  it('rejects a non-object payload', () => {
    const result = parseJsonBody({ body: '[1,2,3]' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.statusCode).toBe(400);
  });
});

describe('badRequest', () => {
  it('serializes the message into a 400 body', () => {
    const response = badRequest('nope');
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ message: 'nope' });
  });
});
