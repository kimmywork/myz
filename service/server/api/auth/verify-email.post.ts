import { H3Error, createError, defineEventHandler, readBody } from "h3";

import { verifyEmailSchema } from "@/lib/validators/auth";
import { consumeEmailVerificationToken } from "@/services/user-service";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const parsed = verifyEmailSchema.safeParse(body);

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        data: { error: "Invalid request", details: parsed.error.format() },
      });
    }

    const user = await consumeEmailVerificationToken(parsed.data.token, parsed.data.email);

    if (!user) {
      const tokenSuffix = parsed.data.token.slice(-6);
      console.warn("verify-email: token invalid or email mismatch", {
        tokenSuffix,
        email: parsed.data.email,
      });
      throw createError({ statusCode: 400, data: { error: "Invalid or expired token" } });
    }

    return {
      message: "Email verified",
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  } catch (error) {
    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to verify email", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
