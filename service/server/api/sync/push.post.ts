import { H3Error, createError, defineEventHandler, readBody } from "h3";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { syncRecords, syncStates, users } from "@/db/schema";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth/request";
import { applyChanges, emptySnapshot, type SyncSnapshot } from "@/lib/sync";
import { appendChangeSet, readSnapshot, saveSnapshot } from "@/lib/storage";
import { pushSyncSchema } from "@/lib/validators/sync";

class SyncConflictError extends Error {
  constructor(public readonly serverCursor: number) {
    super("Sync cursor mismatch");
  }
}

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireAuthenticatedUser(event);
    const body = await readBody(event);
    const parsed = pushSyncSchema.safeParse(body);

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        data: { error: "Invalid request", details: parsed.error.format() },
      });
    }

    const incomingCursor = parsed.data.cursor ?? 0;

    const currentSnapshot =
      (await readSnapshot<SyncSnapshot>(user.id)) ?? emptySnapshot();

    const result = await db.transaction(async (tx) => {
      const [state] = await tx
        .select()
        .from(syncStates)
        .where(eq(syncStates.userId, user.id))
        .limit(1);

      const currentVersion = state?.currentVersion ?? 0;

      if (incomingCursor !== currentVersion) {
        throw new SyncConflictError(currentVersion);
      }

      const nextVersion = currentVersion + 1;
      const updatedSnapshot = applyChanges(currentSnapshot, parsed.data.changes);

      await saveSnapshot(user.id, updatedSnapshot);
      await appendChangeSet(user.id, nextVersion, parsed.data.changes);

      const [history] = await tx
        .insert(syncRecords)
        .values({
          userId: user.id,
          version: nextVersion,
          status: "success",
          summary: parsed.data.summary ?? null,
          clientCursor: String(incomingCursor),
          serverCursor: String(nextVersion),
          changeSet: parsed.data.changes,
        })
        .returning();

      const updatedAt = new Date();

      await tx
        .insert(syncStates)
        .values({ userId: user.id, currentVersion: nextVersion, updatedAt })
        .onConflictDoUpdate({
          target: syncStates.userId,
          set: { currentVersion: nextVersion, updatedAt },
        });

      await tx
        .update(users)
        .set({
          lastSyncAt: updatedAt,
          syncCursor: String(nextVersion),
        })
        .where(eq(users.id, user.id));

      return {
        cursor: nextVersion,
        snapshot: updatedSnapshot,
        history,
      };
    });

    return {
      cursor: result.cursor,
      snapshot: result.snapshot,
      history: {
        id: result.history.id,
        syncedAt: result.history.syncedAt,
        summary: result.history.summary,
        status: result.history.status,
      },
    };
  } catch (error) {
    if (error instanceof SyncConflictError) {
      throw createError({
        statusCode: 409,
        data: {
          error: "Sync cursor mismatch",
          serverCursor: error.serverCursor,
        },
      });
    }

    if (error instanceof AuthenticationError) {
      throw createError({ statusCode: error.status, data: { error: error.message } });
    }

    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to push sync changes", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
