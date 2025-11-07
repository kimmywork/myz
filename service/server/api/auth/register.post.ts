import { H3Error, createError, defineEventHandler, readBody, setResponseStatus } from "h3";

import { hashPassword } from "@/lib/auth/password";
import { verifyCaptcha } from "@/lib/captcha";
import { isProduction } from "@/lib/env";
import { registerSchema } from "@/lib/validators/auth";
import {
  createEmailVerificationToken,
  createUser,
  getUserByEmail,
  updateUserPassword,
} from "@/services/user-service";

export default defineEventHandler(async (event) => {
  try {
    const payload = await readBody(event);
    const parsed = registerSchema.safeParse(payload);

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        data: { error: "Invalid request", details: parsed.error.format() },
      });
    }

    const captchaOk = await verifyCaptcha(
      parsed.data.captchaId,
      parsed.data.captchaAnswer
    );

    if (!captchaOk) {
      throw createError({ statusCode: 403, data: { error: "Captcha validation failed" } });
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const existingUser = await getUserByEmail(normalizedEmail);

    if (existingUser && existingUser.hashedPassword && existingUser.emailVerifiedAt) {
      throw createError({ statusCode: 409, data: { error: "Account already exists" } });
    }

    const hashed = await hashPassword(parsed.data.password);

    const user = existingUser
      ? (await updateUserPassword(existingUser.id, hashed), existingUser)
      : await createUser({ email: normalizedEmail, hashedPassword: hashed });

    const token = await createEmailVerificationToken(user.id);

    if (!existingUser) {
      setResponseStatus(event, 201);
    }

    return {
      message: "Verification required",
      requiresVerification: true,
      verificationToken: isProduction ? undefined : token.token,
      expiresAt: token.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to handle registration", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
