import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = oauthLoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const captchaOk = await verifyCaptcha(
      parsed.data.captchaId,
      parsed.data.captchaAnswer
    );

    if (!captchaOk) {
      return NextResponse.json(
        { error: "Captcha validation failed" },
        { status: 403 }
      );
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
      return NextResponse.json(
        { error: "Email verification required" },
        { status: 403 }
      );
    }

    const session = await createSession(user.id, {
      label: `${parsed.data.provider}-oauth`,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    const response = NextResponse.json({
      token: session.token,
      expiresAt: session.expiresAt?.toString() ?? null,
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt?.toString() ?? null,
      },
    });

    response.cookies.set(sessionCookieName(), session.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt ?? undefined,
    });

    return response;
  } catch (error) {
    console.error("Failed to handle OAuth login", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
