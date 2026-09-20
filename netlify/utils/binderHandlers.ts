// netlify/utils/binderHandlers.ts
import type { HandlerEvent } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { binders } from '../../db/schema';
import { getUserId, unauthorized } from './auth';
import {
  MAX_BINDERS,
  parseBinderDimensions,
  parseBinderId,
  parseBinderName,
  parseBinderSlots,
  parseMergeBinders,
  type BinderSlots,
} from './binders';
import { parseIsPublic } from './lists';
import { badRequest, parseJsonBody } from './request';
import { resolveReadUser } from './share';

/** One binder as the client sees it. */
export type ClientBinder = {
  id: string;
  name: string;
  columns: number;
  rows: number;
  pages: number;
  isPublic: boolean;
  slots: BinderSlots;
  createdAt: string;
  updatedAt: string;
};

/** Parse a stored slots JSON blob defensively (a corrupt row becomes empty). */
function parseStoredSlots(text: string): BinderSlots {
  try {
    const parsed = parseBinderSlots(JSON.parse(text));
    return parsed.ok ? parsed.value : {};
  } catch {
    return {};
  }
}

/**
 * Load a user's binders, oldest first (then by name), in one round trip. With
 * `publicOnly` (a share-link read) only the binders the owner marked public are
 * returned.
 */
async function collectBinders(
  userId: string,
  { publicOnly = false }: { publicOnly?: boolean } = {}
): Promise<ClientBinder[]> {
  const where = publicOnly
    ? and(eq(binders.userId, userId), eq(binders.isPublic, true))
    : eq(binders.userId, userId);

  const rows = await db.select().from(binders).where(where);

  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
      columns: row.columns,
      rows: row.rows,
      pages: row.pages,
      isPublic: row.isPublic,
      slots: parseStoredSlots(row.slots),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
}

/** A successful response carrying the caller's full (fresh) binder set. */
async function bindersResponse(userId: string, options: { publicOnly?: boolean } = {}) {
  return {
    statusCode: 200,
    body: JSON.stringify({ binders: await collectBinders(userId, options) }),
  };
}

/**
 * Read the caller's binders, or the owner's public binders for a share link.
 * Mirrors `readLists`: a share token is a read-only capability.
 */
export async function readBinders(event: HandlerEvent) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const resolved = await resolveReadUser(event, parsed.value.shareToken);
  if (!resolved.ok) return resolved.response;

  // A visitor only ever sees the binders the owner marked public.
  return bindersResponse(resolved.userId, { publicOnly: resolved.shared });
}

/** The caller's binder with the given name (case-insensitive), if any. */
async function findBinderByName(userId: string, name: string) {
  const rows = await db
    .select({ id: binders.id, name: binders.name })
    .from(binders)
    .where(eq(binders.userId, userId));
  const target = name.toLowerCase();
  return rows.find((row) => row.name.toLowerCase() === target) ?? null;
}

/** True when a binder id belongs to `userId`. */
async function ownsBinder(userId: string, binderId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: binders.id })
    .from(binders)
    .where(and(eq(binders.id, binderId), eq(binders.userId, userId)));
  return Boolean(row);
}

/** Create a new binder. */
export async function createBinder(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const name = parseBinderName(parsed.value.name);
  if (!name.ok) return badRequest(name.message);
  const dimensions = parseBinderDimensions(parsed.value);
  if (!dimensions.ok) return badRequest(dimensions.message);
  const slots = parseBinderSlots(parsed.value.slots);
  if (!slots.ok) return badRequest(slots.message);
  const isPublic = parseIsPublic(parsed.value.isPublic);
  if (!isPublic.ok) return badRequest(isPublic.message);

  const existing = await db
    .select({ id: binders.id })
    .from(binders)
    .where(eq(binders.userId, userId));
  if (existing.length >= MAX_BINDERS) {
    return badRequest(`You can have at most ${MAX_BINDERS} binders.`);
  }
  if (await findBinderByName(userId, name.value)) {
    return badRequest('A binder with that name already exists.');
  }

  await db
    .insert(binders)
    .values({
      id: randomUUID(),
      userId,
      name: name.value,
      columns: dimensions.value.columns,
      rows: dimensions.value.rows,
      pages: dimensions.value.pages,
      isPublic: isPublic.value,
      slots: JSON.stringify(slots.value),
    })
    .onConflictDoNothing();

  return bindersResponse(userId);
}

/**
 * Rename a binder, change its dimensions and/or replace its slots and
 * visibility. The client sends the full binder on every mutation, so a
 * placement, move or clear is the same request.
 */
export async function updateBinder(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const id = parseBinderId(parsed.value.binderId);
  if (!id.ok) return badRequest(id.message);
  const name = parseBinderName(parsed.value.name);
  if (!name.ok) return badRequest(name.message);
  const dimensions = parseBinderDimensions(parsed.value);
  if (!dimensions.ok) return badRequest(dimensions.message);

  // A missing `slots`/`isPublic` leaves the stored value untouched.
  const hasSlots = parsed.value.slots !== undefined;
  const slots = hasSlots ? parseBinderSlots(parsed.value.slots) : null;
  if (slots && !slots.ok) return badRequest(slots.message);
  const hasPublic = parsed.value.isPublic !== undefined;
  const isPublic = hasPublic ? parseIsPublic(parsed.value.isPublic) : null;
  if (isPublic && !isPublic.ok) return badRequest(isPublic.message);

  if (!(await ownsBinder(userId, id.value))) return badRequest('Binder not found.');

  const clash = await findBinderByName(userId, name.value);
  if (clash && clash.id !== id.value) {
    return badRequest('A binder with that name already exists.');
  }

  const patch: Record<string, unknown> = {
    name: name.value,
    columns: dimensions.value.columns,
    rows: dimensions.value.rows,
    pages: dimensions.value.pages,
    updatedAt: new Date(),
  };
  if (hasSlots && slots?.ok) patch.slots = JSON.stringify(slots.value);
  if (hasPublic && isPublic?.ok) patch.isPublic = isPublic.value;

  await db
    .update(binders)
    .set(patch)
    .where(and(eq(binders.id, id.value), eq(binders.userId, userId)));

  return bindersResponse(userId);
}

/** Delete a binder. */
export async function deleteBinder(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const id = parseBinderId(parsed.value.binderId);
  if (!id.ok) return badRequest(id.message);

  await db.delete(binders).where(and(eq(binders.id, id.value), eq(binders.userId, userId)));

  return bindersResponse(userId);
}

/**
 * Additively merge a guest's device-local binders into their account, unioning
 * by name. A slot already stored on the server is never overwritten, so
 * re-sending after a failure is safe and guest-only placements are preserved.
 * Dimensions grow to the larger of the two so no pocket is hidden, and a binder
 * is never silently un-published.
 */
export async function mergeBinders(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const incoming = parseMergeBinders(parsed.value.binders);
  if (!incoming.ok) return badRequest(incoming.message);

  const existing = await collectBinders(userId);
  const byName = new Map(
    existing.map((binder) => [
      binder.name.toLowerCase(),
      {
        id: binder.id,
        columns: binder.columns,
        rows: binder.rows,
        pages: binder.pages,
        isPublic: binder.isPublic,
        slots: binder.slots,
      },
    ])
  );

  for (const binder of incoming.value) {
    const match = byName.get(binder.name.toLowerCase());

    if (match) {
      // Server placements win on conflict; guest-only pockets are added.
      const mergedSlots = { ...match.slots };
      for (const [key, id] of Object.entries(binder.slots)) {
        if (!(key in mergedSlots)) mergedSlots[key] = id;
      }
      await db
        .update(binders)
        .set({
          columns: Math.max(match.columns, binder.columns),
          rows: Math.max(match.rows, binder.rows),
          pages: Math.max(match.pages, binder.pages),
          isPublic: match.isPublic || binder.isPublic,
          slots: JSON.stringify(mergedSlots),
          updatedAt: new Date(),
        })
        .where(eq(binders.id, match.id));
      continue;
    }

    if (byName.size >= MAX_BINDERS) continue;

    const id = randomUUID();
    byName.set(binder.name.toLowerCase(), {
      id,
      columns: binder.columns,
      rows: binder.rows,
      pages: binder.pages,
      isPublic: binder.isPublic,
      slots: binder.slots,
    });
    await db.insert(binders).values({
      id,
      userId,
      name: binder.name,
      columns: binder.columns,
      rows: binder.rows,
      pages: binder.pages,
      isPublic: binder.isPublic,
      slots: JSON.stringify(binder.slots),
    });
  }

  return bindersResponse(userId);
}
