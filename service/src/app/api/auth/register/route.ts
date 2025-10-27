import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = registerSchema.safeParse(payload);

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

    const normalizedEmail = parsed.data.email.toLowerCase();
    const existingUser = await getUserByEmail(normalizedEmail);

    if (existingUser && existingUser.hashedPassword && existingUser.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Account already exists" },
        { status: 409 }
      );
    }

    const hashed = await hashPassword(parsed.data.password);

    const user = existingUser
      ? (await updateUserPassword(existingUser.id, hashed), existingUser)
      : await createUser({ email: normalizedEmail, hashedPassword: hashed });

    const token = await createEmailVerificationToken(user.id);

    return NextResponse.json(
      {
        message: "Verification required",
        requiresVerification: true,
        verificationToken: isProduction ? undefined : token.token,
        expiresAt: token.expiresAt.toString(),
      },
      { status: existingUser ? 200 : 201 }
    );
  } catch (error) {
    console.error("Failed to handle registration", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
