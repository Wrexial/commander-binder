// netlify/utils/listHandlers.ts
import type { HandlerEvent } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { cardListItems, cardLists } from '../../db/schema';
import { getUserId, unauthorized } from './auth';
import {
  MAX_LISTS,
  parseCardIdList,
  parseIsPublic,
  parseListId,
  parseListName,
  parseListNotes,
  parseMergeLists,
} from './lists';
import { badRequest, parseJsonBody } from './request';
import { resolveReadUser } from './share';

/** One list as the client sees it: metadata plus its member printing ids. */
export type ClientList = {
  id: string;
  name: string;
  notes: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  cardIds: string[];
};

/**
 * Load a user's lists (optionally only the public ones) together with their
 * membership, in one round trip. The client mirrors this shape into its state.
 */
async function collectLists(
  userId: string,
  { publicOnly = false }: { publicOnly?: boolean } = {}
): Promise<ClientList[]> {
  const where = publicOnly
    ? and(eq(cardLists.userId, userId), eq(cardLists.isPublic, true))
    : eq(cardLists.userId, userId);

  const rows = await db.select().from(cardLists).where(where);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const items = await db
    .select({ listId: cardListItems.listId, cardId: cardListItems.cardId })
    .from(cardListItems)
    .where(inArray(cardListItems.listId, ids));

  const byList = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const item of items) byList.get(item.listId)?.push(item.cardId);

  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
      notes: row.notes,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      cardIds: byList.get(row.id) ?? [],
    }));
}

/** A successful response carrying the caller's full (fresh) list set. */
async function listsResponse(userId: string) {
  return { statusCode: 200, body: JSON.stringify({ lists: await collectLists(userId) }) };
}

/** The caller's lists plus the owner's public lists for a share link. */
export async function readLists(event: HandlerEvent) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const resolved = await resolveReadUser(event, parsed.value.shareToken);
  if (!resolved.ok) return resolved.response;

  // A visitor only ever sees the lists the owner marked public.
  return {
    statusCode: 200,
    body: JSON.stringify({
      lists: await collectLists(resolved.userId, { publicOnly: resolved.shared }),
    }),
  };
}

/** The caller's list with the given name (case-insensitive), if any. */
async function findListByName(userId: string, name: string) {
  const rows = await db
    .select({ id: cardLists.id, name: cardLists.name })
    .from(cardLists)
    .where(eq(cardLists.userId, userId));
  const target = name.toLowerCase();
  return rows.find((row) => row.name.toLowerCase() === target) ?? null;
}

/** True when a list id belongs to `userId` (guards every item mutation). */
async function ownsList(userId: string, listId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: cardLists.id })
    .from(cardLists)
    .where(and(eq(cardLists.id, listId), eq(cardLists.userId, userId)));
  return Boolean(row);
}

/** Create a new named list. */
export async function createList(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const name = parseListName(parsed.value.name);
  if (!name.ok) return badRequest(name.message);
  const notes = parseListNotes(parsed.value.notes);
  if (!notes.ok) return badRequest(notes.message);
  const isPublic = parseIsPublic(parsed.value.isPublic);
  if (!isPublic.ok) return badRequest(isPublic.message);

  const existing = await db
    .select({ id: cardLists.id })
    .from(cardLists)
    .where(eq(cardLists.userId, userId));
  if (existing.length >= MAX_LISTS) {
    return badRequest(`You can have at most ${MAX_LISTS} lists.`);
  }
  if (await findListByName(userId, name.value)) {
    return badRequest('A list with that name already exists.');
  }

  await db
    .insert(cardLists)
    .values({
      id: randomUUID(),
      userId,
      name: name.value,
      notes: notes.value,
      isPublic: isPublic.value,
    })
    .onConflictDoNothing();

  return listsResponse(userId);
}

/** Rename a list, edit its notes or change its visibility. */
export async function updateList(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const id = parseListId(parsed.value.listId);
  if (!id.ok) return badRequest(id.message);
  const name = parseListName(parsed.value.name);
  if (!name.ok) return badRequest(name.message);
  const notes = parseListNotes(parsed.value.notes);
  if (!notes.ok) return badRequest(notes.message);
  const isPublic = parseIsPublic(parsed.value.isPublic);
  if (!isPublic.ok) return badRequest(isPublic.message);

  const [owned] = await db
    .select({ id: cardLists.id })
    .from(cardLists)
    .where(and(eq(cardLists.id, id.value), eq(cardLists.userId, userId)));
  if (!owned) return badRequest('List not found.');

  const clash = await findListByName(userId, name.value);
  if (clash && clash.id !== id.value) {
    return badRequest('A list with that name already exists.');
  }

  await db
    .update(cardLists)
    .set({ name: name.value, notes: notes.value, isPublic: isPublic.value, updatedAt: new Date() })
    .where(and(eq(cardLists.id, id.value), eq(cardLists.userId, userId)));

  return listsResponse(userId);
}

/** Delete a list; the membership rows cascade with it. */
export async function deleteList(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const id = parseListId(parsed.value.listId);
  if (!id.ok) return badRequest(id.message);

  await db.delete(cardLists).where(and(eq(cardLists.id, id.value), eq(cardLists.userId, userId)));

  return listsResponse(userId);
}

/**
 * Add or remove a batch of printings from one of the caller's lists. The list
 * must belong to the caller; a raw user id is never trusted from the body.
 */
export async function mutateListItems(event: HandlerEvent, action: 'add' | 'remove') {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const id = parseListId(parsed.value.listId);
  if (!id.ok) return badRequest(id.message);
  const cardIds = parseCardIdList(parsed.value.cardIds);
  if (!cardIds.ok) return badRequest(cardIds.message);

  if (!(await ownsList(userId, id.value))) {
    return badRequest('List not found.');
  }

  if (cardIds.value.length > 0) {
    if (action === 'add') {
      await db
        .insert(cardListItems)
        .values(cardIds.value.map((cardId) => ({ listId: id.value, cardId })))
        .onConflictDoNothing();
    } else {
      await db
        .delete(cardListItems)
        .where(
          and(eq(cardListItems.listId, id.value), inArray(cardListItems.cardId, cardIds.value))
        );
    }
    await db.update(cardLists).set({ updatedAt: new Date() }).where(eq(cardLists.id, id.value));
  }

  return listsResponse(userId);
}

/**
 * Additively merge a guest's device-local lists into their account, unioning by
 * name so re-sending after a failure is safe. Existing lists keep their
 * visibility/notes unless the incoming copy is public or has notes where the
 * stored one has none (never silently discard what the guest typed).
 */
export async function mergeLists(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const lists = parseMergeLists(parsed.value.lists);
  if (!lists.ok) return badRequest(lists.message);

  const existing = await collectLists(userId);
  // Name (lowercased) -> the stored list's id and metadata, so a re-merge only
  // unions cards and never duplicates a list.
  const byName = new Map(
    existing.map((list) => [
      list.name.toLowerCase(),
      { id: list.id, notes: list.notes, isPublic: list.isPublic },
    ])
  );

  for (const incoming of lists.value) {
    const match = byName.get(incoming.name.toLowerCase());

    if (match) {
      if (incoming.cardIds.length > 0) {
        await db
          .insert(cardListItems)
          .values(incoming.cardIds.map((cardId) => ({ listId: match.id, cardId })))
          .onConflictDoNothing();
      }
      // Never silently discard what the guest typed or un-publish a list.
      const notes = match.notes.length === 0 ? incoming.notes : match.notes;
      const isPublic = match.isPublic || incoming.isPublic;
      await db
        .update(cardLists)
        .set({ notes, isPublic, updatedAt: new Date() })
        .where(eq(cardLists.id, match.id));
      continue;
    }

    if (byName.size >= MAX_LISTS) continue;

    const id = randomUUID();
    byName.set(incoming.name.toLowerCase(), {
      id,
      notes: incoming.notes,
      isPublic: incoming.isPublic,
    });
    await db.insert(cardLists).values({
      id,
      userId,
      name: incoming.name,
      notes: incoming.notes,
      isPublic: incoming.isPublic,
    });
    if (incoming.cardIds.length > 0) {
      await db
        .insert(cardListItems)
        .values(incoming.cardIds.map((cardId) => ({ listId: id, cardId })))
        .onConflictDoNothing();
    }
  }

  return listsResponse(userId);
}
