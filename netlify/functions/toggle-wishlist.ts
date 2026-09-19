import type { HandlerEvent } from '@netlify/functions';
import { toggleCollection } from '../utils/collectionHandlers';

export const handler = (event: HandlerEvent) => toggleCollection(event, 'wishlist');
