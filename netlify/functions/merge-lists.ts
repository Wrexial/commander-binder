import type { HandlerEvent } from '@netlify/functions';
import { mergeLists } from '../utils/listHandlers';

// Union a signed-out visitor's device-local lists into their account. A share
// token is deliberately ignored so a share visitor can never write.
export const handler = (event: HandlerEvent) => mergeLists(event);
