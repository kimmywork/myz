import { eq } from "drizzle-orm";
import crypto from "node:crypto";

import { db } from "@/db";
import { captchaChallenges } from "@/db/schema";
import { env } from "@/lib/env";
import { hashToken, verifyTokenHash } from "@/lib/crypto";

const { randomInt } = crypto;

const CHALLENGE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const MAX_ATTEMPTS = 5;

export type CaptchaChallengePayload = {
  id: string;
  question: string;
  expiresAt: string;
};

export async function createCaptchaChallenge(): Promise<CaptchaChallengePayload> {
  const challenge = buildChallenge();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  const [record] = await db
    .insert(captchaChallenges)
    .values({
      question: challenge.prompt,
      answerHash: hashToken(challenge.answer),
      expiresAt,
    })
    .returning({ id: captchaChallenges.id });

  return {
    id: record.id,
    question: challenge.prompt,
    expiresAt: expiresAt.toString(),
  };
}

export async function verifyCaptcha(
  challengeId: string,
  answer: string
): Promise<boolean> {
  if (!challengeId) {
    return false;
  }

  if (env.CAPTCHA_MODE === "test-bypass") {
    if (!env.CAPTCHA_BYPASS_TOKEN) {
      return true;
    }

    return answer === env.CAPTCHA_BYPASS_TOKEN;
  }

  const [challenge] = await db
    .select()
    .from(captchaChallenges)
    .where(eq(captchaChallenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    return false;
  }

  if (challenge.consumedAt) {
    return false;
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    return false;
  }

  if (challenge.expiresAt.getTime() <= Date.now()) {
    return false;
  }

  const normalizedAnswer = answer.trim().toLowerCase();
  const isValid = verifyTokenHash(normalizedAnswer, challenge.answerHash);

  const update = db
    .update(captchaChallenges)
    .set({
      attempts: challenge.attempts + 1,
      consumedAt: isValid ? new Date() : null,
    })
    .where(eq(captchaChallenges.id, challengeId));

  await update;

  return isValid;
}

function buildChallenge(): { prompt: string; answer: string } {
  const operandA = randomInt(1, 20);
  const operandB = randomInt(1, 20);

  // Randomly decide between addition and subtraction to keep bots off.
  const useAddition = randomInt(0, 2) === 1;

  if (useAddition || operandA < operandB) {
    return {
      prompt: `What is ${operandA} + ${operandB}?`,
      answer: String(operandA + operandB),
    };
  }

  return {
    prompt: `What is ${operandA} - ${operandB}?`,
    answer: String(operandA - operandB),
  };
}
