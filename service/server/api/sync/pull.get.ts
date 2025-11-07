import { H3Error, createError, defineEventHandler, getQuery } from "h3";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { syncStates } from "@/db/schema";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth/request";
import { emptySnapshot, type SyncSnapshot } from "@/lib/sync";
import { readChangeSets, readSnapshot } from "@/lib/storage";
import { pullSyncQuerySchema } from "@/lib/validators/sync";

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireAuthenticatedUser(event);
    const query = getQuery(event);
    const parsed = pullSyncQuerySchema.safeParse({ cursor: query.cursor });

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        data: { error: "Invalid query", details: parsed.error.format() },
      });
    }

    const [state] = await db
      .select()
      .from(syncStates)
      .where(eq(syncStates.userId, user.id))
      .limit(1);

    const currentVersion = state?.currentVersion ?? 0;

    if (!state) {
      await db
        .insert(syncStates)
        .values({ userId: user.id, currentVersion: 0 })
        .onConflictDoNothing();
    }

    const snapshot =
      (await readSnapshot<SyncSnapshot>(user.id)) ?? emptySnapshot();

    const cursor = parsed.data.cursor;
    const changes =
      typeof cursor === "number" ? await readChangeSets(user.id, cursor) : [];

    return {
      cursor: currentVersion,
      snapshot,
      changes,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw createError({ statusCode: error.status, data: { error: error.message } });
    }

    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to pull sync changes", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
