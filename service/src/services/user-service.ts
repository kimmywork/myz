import { randomUUID } from "crypto";
import { eq, and, desc, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  users,
  oauthIdentities,
  emailVerificationTokens,
  syncStates,
  syncRecords,
  type User,
  type SyncRecord,
  type SyncState,
  type SyncRecordInsert,
} from "@/db/schema";
import { hashToken } from "@/lib/crypto";

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function createUser(params: {
  email: string;
  hashedPassword?: string;
  emailVerifiedAt?: Date | null;
}): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      email: params.email,
      hashedPassword: params.hashedPassword,
      emailVerifiedAt: params.emailVerifiedAt ?? null,
    })
    .returning();

  return user;
}

export async function updateUserPassword(
  userId: string,
  hashedPassword: string
): Promise<void> {
  await db
    .update(users)
    .set({ hashedPassword })
    .where(eq(users.id, userId));
}

export async function createEmailVerificationToken(
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomUUID();
  const hashed = hashToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await db
    .delete(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.consumedAt)));

  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashed,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumeEmailVerificationToken(
  token: string
): Promise<User | null> {
  const hashed = hashToken(token);

  const [record] = await db
    .select({ token: emailVerificationTokens, user: users })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(emailVerificationTokens.userId, users.id))
    .where(eq(emailVerificationTokens.tokenHash, hashed))
    .limit(1);

  if (!record) {
    return null;
  }

  if (record.token.consumedAt) {
    return null;
  }

  if (record.token.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(emailVerificationTokens)
      .set({ consumedAt: now })
      .where(eq(emailVerificationTokens.id, record.token.id));

    await tx
      .update(users)
      .set({ emailVerifiedAt: now })
      .where(eq(users.id, record.user.id));
  });

  return { ...record.user, emailVerifiedAt: new Date() } satisfies User;
}

export async function markEmailVerified(userId: string): Promise<User> {
  const now = new Date();
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: now })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

export async function linkOAuthIdentity(params: {
  userId: string;
  provider: "google" | "github";
  providerUserId: string;
  email?: string;
}): Promise<void> {
  await db
    .insert(oauthIdentities)
    .values({
      userId: params.userId,
      provider: params.provider,
      providerUserId: params.providerUserId,
      email: params.email,
    })
    .onConflictDoUpdate({
      target: [oauthIdentities.provider, oauthIdentities.providerUserId],
      set: { email: params.email },
    });
}

export async function findOAuthIdentity(params: {
  provider: "google" | "github";
  providerUserId: string;
}): Promise<User | null> {
  const [row] = await db
    .select({ user: users })
    .from(oauthIdentities)
    .innerJoin(users, eq(oauthIdentities.userId, users.id))
    .where(
      and(
        eq(oauthIdentities.provider, params.provider),
        eq(oauthIdentities.providerUserId, params.providerUserId)
      )
    )
    .limit(1);

  return row?.user ?? null;
}

export async function ensureSyncState(userId: string): Promise<SyncState> {
  const [existing] = await db
    .select()
    .from(syncStates)
    .where(eq(syncStates.userId, userId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [state] = await db
    .insert(syncStates)
    .values({ userId, currentVersion: 0 })
    .returning();

  return state;
}

export async function incrementSyncState(
  userId: string
): Promise<SyncState> {
  const [current] = await db
    .select()
    .from(syncStates)
    .where(eq(syncStates.userId, userId))
    .limit(1);

  if (!current) {
    throw new Error("Sync state not initialized");
  }

  const nextVersion = current.currentVersion + 1;
  const updatedAt = new Date();

  const [updated] = await db
    .update(syncStates)
    .set({ currentVersion: nextVersion, updatedAt })
    .where(eq(syncStates.userId, userId))
    .returning();

  return updated;
}

export async function recordSync(
  params: Omit<SyncRecordInsert, "id">
): Promise<SyncRecord> {
  const [record] = await db.insert(syncRecords).values(params).returning();
  return record;
}

export async function listSyncHistory(
  userId: string,
  limit = 20
): Promise<SyncRecord[]> {
  return db
    .select()
    .from(syncRecords)
    .where(eq(syncRecords.userId, userId))
    .orderBy(desc(syncRecords.syncedAt))
    .limit(limit);
}
