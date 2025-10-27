import { NextRequest, NextResponse } from "next/server";

import { revokeSession } from "@/lib/auth/session";
import { extractToken, sessionCookieName } from "@/lib/auth/request";
import { isProduction } from "@/lib/env";

export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);

    if (token) {
      await revokeSession(token);
    }

    const response = NextResponse.json({ message: "Logged out" });
    response.cookies.set(sessionCookieName(), "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error("Failed to handle logout", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
