import { H3Error, createError, defineEventHandler, setCookie } from "h3";

import { revokeSession } from "@/lib/auth/session";
import { extractToken, sessionCookieName } from "@/lib/auth/request";
import { isProduction } from "@/lib/env";

export default defineEventHandler(async (event) => {
  try {
    const token = extractToken(event);

    if (token) {
      await revokeSession(token);
    }

    setCookie(event, sessionCookieName(), "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      expires: new Date(0),
    });

    return { message: "Logged out" };
  } catch (error) {
    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to handle logout", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
