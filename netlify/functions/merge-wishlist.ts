import type { HandlerEvent } from '@netlify/functions';
import { mergeCollection } from '../utils/collectionHandlers';

export const handler = (event: HandlerEvent) => mergeCollection(event, 'wishlist');
