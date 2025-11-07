import { H3Error, createError, defineEventHandler } from "h3";

import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth/request";
import { emptySnapshot, type SyncSnapshot } from "@/lib/sync";
import { readSnapshot } from "@/lib/storage";

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireAuthenticatedUser(event);
    const snapshot = await readSnapshot<SyncSnapshot>(user.id);

    return {
      snapshot: snapshot ?? emptySnapshot(),
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw createError({ statusCode: error.status, data: { error: error.message } });
    }

    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to load snapshot", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
