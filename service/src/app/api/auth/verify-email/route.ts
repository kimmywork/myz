import { NextRequest, NextResponse } from "next/server";

import { verifyEmailSchema } from "@/lib/validators/auth";
import { consumeEmailVerificationToken } from "@/services/user-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = verifyEmailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const user = await consumeEmailVerificationToken(parsed.data.token);

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    return NextResponse.json({
      message: "Email verified",
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toString() ?? null,
    });
  } catch (error) {
    console.error("Failed to verify email", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
