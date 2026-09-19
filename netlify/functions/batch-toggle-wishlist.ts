import type { HandlerEvent } from '@netlify/functions';
import { batchToggleCollection } from '../utils/collectionHandlers';

export const handler = (event: HandlerEvent) => batchToggleCollection(event, 'wishlist');
