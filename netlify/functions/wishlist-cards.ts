import type { HandlerEvent } from '@netlify/functions';
import { readCollection } from '../utils/collectionHandlers';

export const handler = (event: HandlerEvent) => readCollection(event, 'wishlist');
