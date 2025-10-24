"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type CaptchaChallenge = {
  id: string;
  question: string;
  expiresAt: string;
};

type RegisterResponse = {
  message: string;
  requiresVerification: boolean;
  verificationToken?: string;
  expiresAt?: string;
};

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationHint, setVerificationHint] = useState<string | null>(null);

  const loadCaptcha = useCallback(async () => {
    try {
      setCaptchaAnswer("");
      const response = await fetch("/api/captcha/challenge", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to load captcha challenge");
      }

      const payload = (await response.json()) as { challenge: CaptchaChallenge };
      setCaptcha(payload.challenge);
    } catch (loadError) {
      console.error(loadError);
      setError("Failed to load captcha. Please refresh the page.");
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!captcha) {
      setError("Captcha challenge has expired. Please refresh.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatus(null);
    setVerificationHint(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          captchaId: captcha.id,
          captchaAnswer,
        }),
      });

      const payload = (await response.json()) as RegisterResponse | { error: string };

      if (!response.ok) {
        setError((payload as { error: string }).error ?? "Registration failed");
        void loadCaptcha();
        return;
      }

      const successPayload = payload as RegisterResponse;
      setStatus(successPayload.message);

      if (successPayload.verificationToken) {
        setVerificationHint(
          `Development hint: verification token ${successPayload.verificationToken}`
        );
      }

      void loadCaptcha();
    } catch (submitError) {
      console.error(submitError);
      setError("Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
      <div>
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="mt-2 text-sm text-white/60">
          Register for the MyZ sync service. You will receive a verification
          link before you can log in.
        </p>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="block text-sm text-white/70" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-white/70" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
          />
          <p className="text-xs text-white/50">
            Use at least 8 characters with upper, lower, and numeric symbols.
          </p>
        </div>
        <fieldset className="space-y-3 rounded-lg border border-dashed border-white/20 p-4">
          <legend className="px-2 text-sm text-white/70">Captcha</legend>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-white">
              {captcha ? captcha.question : "Loading challenge..."}
            </span>
            <button
              type="button"
              onClick={() => void loadCaptcha()}
              className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/60 hover:text-white"
            >
              Refresh
            </button>
          </div>
          <input
            type="text"
            required
            placeholder="Answer"
            value={captchaAnswer}
            onChange={(event) => setCaptchaAnswer(event.target.value)}
            className="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
          />
        </fieldset>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating account..." : "Register"}
        </button>
      </form>
      {status && <p className="text-sm text-emerald-300">{status}</p>}
      {verificationHint && (
        <p className="text-xs text-emerald-200">{verificationHint}</p>
      )}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <p className="text-sm text-white/60">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-white underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </section>
  );
}
