"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  token: string;
};

type VerifyResponse = {
  message: string;
  email: string;
  emailVerifiedAt: string | null;
};

export default function VerifyEmailClient({ token }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    const controller = new AbortController();

    async function verify() {
      try {
        setStatus("Verifying...");
        setError(null);

        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });

        const payload = (await response.json()) as VerifyResponse | { error: string };

        if (!response.ok) {
          setError((payload as { error: string }).error ?? "Verification failed");
          setStatus(null);
          return;
        }

        const data = payload as VerifyResponse;
        setStatus(`Email ${data.email} verified successfully.`);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          console.error(requestError);
          setError("Verification failed. Please try again.");
          setStatus(null);
        }
      }
    }

    void verify();

    return () => {
      controller.abort();
    };
  }, [token]);

  return (
    <section className="mx-auto w-full max-w-lg space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
      <h1 className="text-2xl font-semibold">Verify email</h1>
      {!token && (
        <p className="text-sm text-white/60">
          Provide a verification token in the URL, e.g. <code>?token=...</code>
        </p>
      )}
      {token && (
        <p className="text-sm text-white/60">
          Verifying token <code className="font-mono">{token}</code>
        </p>
      )}
      {status && <p className="text-sm text-emerald-300">{status}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <p className="text-sm text-white/60">
        Ready to continue?{" "}
        <Link
          href="/login"
          className="font-semibold text-white underline-offset-4 hover:underline"
        >
          Return to login
        </Link>
      </p>
    </section>
  );
}
