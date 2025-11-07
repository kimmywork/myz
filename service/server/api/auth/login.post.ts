import { H3Error, createError, defineEventHandler, readBody, setCookie } from "h3";

import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { sessionCookieName } from "@/lib/auth/request";
import { verifyCaptcha } from "@/lib/captcha";
import { isProduction } from "@/lib/env";
import { loginSchema } from "@/lib/validators/auth";
import { getUserByEmail } from "@/services/user-service";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const parsed = loginSchema.safeParse(body);

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

    const user = await getUserByEmail(parsed.data.email.toLowerCase());

    if (!user || !user.hashedPassword) {
      throw createError({ statusCode: 401, data: { error: "Invalid credentials" } });
    }

    if (!user.emailVerifiedAt) {
      throw createError({ statusCode: 403, data: { error: "Email verification required" } });
    }

    const passwordValid = await verifyPassword(parsed.data.password, user.hashedPassword);

    if (!passwordValid) {
      throw createError({ statusCode: 401, data: { error: "Invalid credentials" } });
    }

    const session = await createSession(user.id, {
      label: "email-login",
      userAgent: event.node.req.headers["user-agent"] ?? undefined,
    });

    setCookie(event, sessionCookieName(), session.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt ?? undefined,
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt?.toISOString() ?? null,
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    if (error instanceof H3Error) {
      throw error;
    }

    console.error("Failed to handle login", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
