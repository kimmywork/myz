import { H3Error, createError, defineEventHandler } from "h3";

import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth/request";

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireAuthenticatedUser(event);

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        lastSyncAt: user.lastSyncAt?.toISOString() ?? null,
        status: user.status,
      },
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw createError({ statusCode: error.status, data: { error: error.message } });
    }

    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to resolve session", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
