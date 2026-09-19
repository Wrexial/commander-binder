import type { HandlerEvent } from '@netlify/functions';
import { createList, deleteList, updateList } from '../utils/listHandlers';
import { badRequest, parseJsonBody } from '../utils/request';

// Create, rename/edit or delete a named list. The action lives in the body
// because all three are authenticated writes against the same resource.
export const handler = async (event: HandlerEvent) => {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  switch (parsed.value.action) {
    case 'create':
      return createList(event);
    case 'update':
      return updateList(event);
    case 'delete':
      return deleteList(event);
    default:
      return badRequest("'action' must be 'create', 'update' or 'delete'.");
  }
};
