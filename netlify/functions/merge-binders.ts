import type { HandlerEvent } from '@netlify/functions';
import { mergeBinders } from '../utils/binderHandlers';

// Union a signed-out visitor's device-local binders into their account. A share
// token is deliberately ignored so a share visitor can never write.
export const handler = (event: HandlerEvent) => mergeBinders(event);
