import { H3Error, createError, defineEventHandler } from "h3";

import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth/request";
import { listSyncHistory } from "@/services/user-service";

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireAuthenticatedUser(event);
    const history = await listSyncHistory(user.id);

    return { history };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw createError({ statusCode: error.status, data: { error: error.message } });
    }

    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to load sync history", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
