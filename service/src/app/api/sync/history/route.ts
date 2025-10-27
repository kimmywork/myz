import { NextRequest, NextResponse } from "next/server";

import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth/request";
import { listSyncHistory } from "@/services/user-service";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request);
    const history = await listSyncHistory(user.id);

    return NextResponse.json({ history });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to load sync history", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
