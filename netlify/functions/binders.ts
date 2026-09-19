import type { HandlerEvent } from '@netlify/functions';
import { readBinders } from '../utils/binderHandlers';

// Read the caller's Binder Builder layouts. Binders are private to the account,
// so unlike `lists` there is no share-token capability here.
export const handler = (event: HandlerEvent) => readBinders(event);
