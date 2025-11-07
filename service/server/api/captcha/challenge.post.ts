import { defineEventHandler } from "h3";

import { createCaptchaChallenge } from "@/lib/captcha";

export default defineEventHandler(async () => {
  const challenge = await createCaptchaChallenge();
  return { challenge };
});
