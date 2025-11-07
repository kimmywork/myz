import { H3Error, createError, defineEventHandler, readBody, setCookie } from "h3";

import { createSession } from "@/lib/auth/session";
import { sessionCookieName } from "@/lib/auth/request";
import { verifyCaptcha } from "@/lib/captcha";
import { isProduction } from "@/lib/env";
import { fetchOAuthProfile } from "@/lib/oauth";
import { oauthLoginSchema } from "@/lib/validators/auth";
import {
  createUser,
  findOAuthIdentity,
  getUserByEmail,
  linkOAuthIdentity,
  markEmailVerified,
} from "@/services/user-service";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const parsed = oauthLoginSchema.safeParse(body);

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

    const profile = await fetchOAuthProfile(
      parsed.data.provider,
      parsed.data.accessToken
    );

    const identityUser = await findOAuthIdentity({
      provider: parsed.data.provider,
      providerUserId: profile.providerUserId,
    });

    let user = identityUser;

    if (!user) {
      const emailMatch = await getUserByEmail(profile.email.toLowerCase());

      if (emailMatch) {
        user = emailMatch;
      } else {
        user = await createUser({
          email: profile.email.toLowerCase(),
          emailVerifiedAt: profile.verified ? new Date() : null,
        });
      }

      await linkOAuthIdentity({
        userId: user.id,
        provider: parsed.data.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
      });
    }

    if (!user.emailVerifiedAt && profile.verified) {
      user = await markEmailVerified(user.id);
    }

    if (!user.emailVerifiedAt) {
      throw createError({ statusCode: 403, data: { error: "Email verification required" } });
    }

    const session = await createSession(user.id, {
      label: `${parsed.data.provider}-oauth`,
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

    console.error("Failed to handle OAuth login", error);
    throw createError({ statusCode: 500, data: { error: "Unexpected error" } });
  }
});
