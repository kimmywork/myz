import { eq, and, isNull, or, gt } from "drizzle-orm";

import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { generateToken, hashToken, verifyTokenHash } from "@/lib/crypto";

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type SessionMetadata = {
  label?: string;
  userAgent?: string;
  rememberForMs?: number;
};

export async function createSession(
  userId: string,
  metadata: SessionMetadata = {}
): Promise<{ token: string; expiresAt: Date | null }> {
  const token = generateToken();
  const tokenHash = hashToken(token);

  const expiresAt = metadata.rememberForMs
    ? new Date(Date.now() + metadata.rememberForMs)
    : new Date(Date.now() + DEFAULT_SESSION_TTL_MS);

  await db.insert(apiTokens).values({
    userId,
    tokenHash,
    label: metadata.label,
    userAgent: metadata.userAgent,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.tokenHash, tokenHash));
}

export async function revokeSessionsForUser(userId: string): Promise<void> {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.userId, userId));
}

export async function resolveSession(token: string) {
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      token: apiTokens,
      user: users,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(
      and(
        eq(apiTokens.tokenHash, tokenHash),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date()))
      )
    )
    .limit(1);

  const match = rows[0];

  if (!match) {
    return null;
  }

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, match.token.id));

  return {
    token: match.token,
    user: match.user,
  };
}

export async function verifySessionToken(
  plaintextToken: string
): Promise<{ token: typeof apiTokens.$inferSelect; user: typeof users.$inferSelect } | null> {
  const tokenHash = hashToken(plaintextToken);

  const rows = await db
    .select({
      token: apiTokens,
      user: users,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  const match = rows[0];

  if (!match) {
    return null;
  }

  if (match.token.revokedAt) {
    return null;
  }

  if (match.token.expiresAt && match.token.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  if (!verifyTokenHash(plaintextToken, match.token.tokenHash)) {
    return null;
  }

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, match.token.id));

  return match;
}
