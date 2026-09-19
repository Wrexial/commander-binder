import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { userSettings } from '../../db/schema';

/**
 * Largest settings blob we accept, to keep one account from bloating a row.
 * The preferred-printings map (name -> Scryfall id) is the main consumer; with
 * `MAX_PREFERRED_PRINTINGS` capped at 150 it stays comfortably under this.
 */
export const MAX_SETTINGS_BYTES = 16 * 1024;

/** A settings payload is a plain, non-array object. */
export function isValidSettings(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** True when the serialized payload stays within {@link MAX_SETTINGS_BYTES}. */
export function isWithinLimit(value: Record<string, unknown>): boolean {
  return JSON.stringify(value).length <= MAX_SETTINGS_BYTES;
}

/** Read a user's saved settings object, or null when none are stored. */
export async function loadSettings(userId: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ settings: userSettings.settings })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  if (!row) return null;

  try {
    const parsed = JSON.parse(row.settings);
    return isValidSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Upsert a user's settings. Callers validate shape and size first. */
export async function saveSettings(
  userId: string,
  settings: Record<string, unknown>
): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, settings: JSON.stringify(settings) })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { settings: JSON.stringify(settings), updatedAt: new Date() },
    });
}
