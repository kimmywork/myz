import { cookies } from "next/headers";

import { verifySessionToken } from "@/lib/auth/session";
import { sessionCookieName } from "@/lib/auth/request";
import type { User } from "@/db/schema";

export async function getCurrentUserFromCookies(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;

  if (!token) {
    return null;
  }

  const session = await verifySessionToken(token);
  return session?.user ?? null;
}
