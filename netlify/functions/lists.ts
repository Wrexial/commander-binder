import type { HandlerEvent } from '@netlify/functions';
import { readLists } from '../utils/listHandlers';

// Read the caller's custom lists (or, with a share token, the owner's public
// lists). Mirrors `owned-cards`: a share token is a read-only capability.
export const handler = (event: HandlerEvent) => readLists(event);
