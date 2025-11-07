import { verifySessionToken } from "@/lib/auth/session";
import { sessionCookieName } from "@/lib/auth/request";
import type { User } from "@/db/schema";
import { getCookie } from "h3";
import type { H3Event } from "h3";

function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookieString = document.cookie;
  if (!cookieString) {
    return null;
  }

  const pairs = cookieString.split(";");
  for (const pair of pairs) {
    const [rawKey, rawValue] = pair.split("=");
    if (rawKey && rawKey.trim() === name) {
      return decodeURIComponent(rawValue ?? "");
    }
  }

  return null;
}

export async function getCurrentUserFromCookies(
  event?: H3Event | null
): Promise<User | null> {
  const token = event
    ? getCookie(event, sessionCookieName())
    : readBrowserCookie(sessionCookieName());

  if (!token) {
    return null;
  }

  const session = await verifySessionToken(token);
  return session?.user ?? null;
}
