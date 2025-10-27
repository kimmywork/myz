import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { syncStates } from "@/db/schema";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth/request";
import { emptySnapshot, type SyncSnapshot } from "@/lib/sync";
import { readChangeSets, readSnapshot } from "@/lib/storage";
import { pullSyncQuerySchema } from "@/lib/validators/sync";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const parsed = pullSyncQuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const [state] = await db
      .select()
      .from(syncStates)
      .where(eq(syncStates.userId, user.id))
      .limit(1);

    const currentVersion = state?.currentVersion ?? 0;

    if (!state) {
      await db
        .insert(syncStates)
        .values({ userId: user.id, currentVersion: 0 })
        .onConflictDoNothing();
    }

    const snapshot =
      (await readSnapshot<SyncSnapshot>(user.id)) ?? emptySnapshot();

    const cursor = parsed.data.cursor;
    const changes =
      typeof cursor === "number" ? await readChangeSets(user.id, cursor) : [];

    return NextResponse.json({
      cursor: currentVersion,
      snapshot,
      changes,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to pull sync changes", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
