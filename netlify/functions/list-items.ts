import type { HandlerEvent } from '@netlify/functions';
import { mutateListItems } from '../utils/listHandlers';
import { badRequest, parseJsonBody } from '../utils/request';

// Add or remove a batch of printings from one of the caller's lists.
export const handler = async (event: HandlerEvent) => {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  switch (parsed.value.action) {
    case 'add':
      return mutateListItems(event, 'add');
    case 'remove':
      return mutateListItems(event, 'remove');
    default:
      return badRequest("'action' must be 'add' or 'remove'.");
  }
};
