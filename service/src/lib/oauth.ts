import { isTest } from "@/lib/env";

export type OAuthProvider = "google" | "github";

export type OAuthProfile = {
  email: string;
  providerUserId: string;
  verified: boolean;
};

export async function fetchOAuthProfile(
  provider: OAuthProvider,
  accessToken: string
): Promise<OAuthProfile> {
  if (isTest && accessToken.startsWith("test:")) {
    const [, email] = accessToken.split(":");
    if (!email) {
      throw new Error("Malformed test token");
    }

    return {
      email,
      providerUserId: `test-${email}`,
      verified: true,
    };
  }

  switch (provider) {
    case "google":
      return fetchGoogleProfile(accessToken);
    case "github":
      return fetchGithubProfile(accessToken);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${exhaustive}`);
    }
  }
}

async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to verify Google access token");
  }

  const payload = (await response.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
  };

  if (!payload.email) {
    throw new Error("Google account is missing an email");
  }

  return {
    email: payload.email,
    providerUserId: payload.sub,
    verified: payload.email_verified ?? false,
  };
}

async function fetchGithubProfile(accessToken: string): Promise<OAuthProfile> {
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "myz-service",
  } satisfies Record<string, string>;

  const userResponse = await fetch("https://api.github.com/user", {
    headers: baseHeaders,
  });

  if (!userResponse.ok) {
    throw new Error("Failed to verify GitHub access token");
  }

  const userPayload = (await userResponse.json()) as {
    id: number;
    email?: string;
  };

  if (userPayload.email) {
    return {
      email: userPayload.email,
      providerUserId: String(userPayload.id),
      verified: true,
    };
  }

  const emailsResponse = await fetch("https://api.github.com/user/emails", {
    headers: baseHeaders,
  });

  if (!emailsResponse.ok) {
    throw new Error("Unable to load GitHub email addresses");
  }

  const emails = (await emailsResponse.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;

  const primaryEmail = emails.find((entry) => entry.primary && entry.verified);

  if (!primaryEmail) {
    throw new Error("GitHub account has no verified primary email");
  }

  return {
    email: primaryEmail.email,
    providerUserId: String(userPayload.id),
    verified: primaryEmail.verified,
  };
}
