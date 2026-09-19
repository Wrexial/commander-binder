import type { HandlerEvent } from '@netlify/functions';
import { createBinder, deleteBinder, updateBinder } from '../utils/binderHandlers';
import { badRequest, parseJsonBody } from '../utils/request';

// Create, update (rename/dimensions/slots) or delete a Binder Builder layout.
// The action lives in the body because all three are authenticated writes
// against the same resource.
export const handler = async (event: HandlerEvent) => {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  switch (parsed.value.action) {
    case 'create':
      return createBinder(event);
    case 'update':
      return updateBinder(event);
    case 'delete':
      return deleteBinder(event);
    default:
      return badRequest("'action' must be 'create', 'update' or 'delete'.");
  }
};
