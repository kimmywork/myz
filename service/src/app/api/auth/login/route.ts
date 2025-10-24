import { NextRequest, NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { sessionCookieName } from "@/lib/auth/request";
import { verifyCaptcha } from "@/lib/captcha";
import { isProduction } from "@/lib/env";
import { loginSchema } from "@/lib/validators/auth";
import { getUserByEmail } from "@/services/user-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

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

    const user = await getUserByEmail(parsed.data.email.toLowerCase());

    if (!user || !user.hashedPassword) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json({ error: "Email verification required" }, { status: 403 });
    }

    const passwordValid = await verifyPassword(
      parsed.data.password,
      user.hashedPassword
    );

    if (!passwordValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const session = await createSession(user.id, {
      label: "email-login",
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
    console.error("Failed to handle login", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
