import { verifySessionToken } from "@/lib/auth/session";
import type { User } from "@/db/schema";
import { getCookie, getHeader } from "h3";
import type { H3Event } from "h3";

export class AuthenticationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

const SESSION_COOKIE_NAME = "myz_session";

export async function requireAuthenticatedUser(
  event: H3Event
): Promise<{ user: User; sessionToken: string }> {
  const token = extractToken(event);

  if (!token) {
    throw new AuthenticationError(401, "Missing authentication token");
  }

  const session = await verifySessionToken(token);

  if (!session) {
    throw new AuthenticationError(401, "Invalid authentication token");
  }

  if (!session.user.emailVerifiedAt) {
    throw new AuthenticationError(403, "Email verification required");
  }

  return {
    user: session.user,
    sessionToken: token,
  };
}

export function extractToken(event: H3Event): string | null {
  const header = getHeader(event, "authorization");

  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  const cookieToken = getCookie(event, SESSION_COOKIE_NAME);

  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}
