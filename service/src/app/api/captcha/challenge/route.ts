import { NextResponse } from "next/server";

import { createCaptchaChallenge } from "@/lib/captcha";

export async function POST() {
  const challenge = await createCaptchaChallenge();
  return NextResponse.json({ challenge });
}

export const dynamic = "force-dynamic";
