"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CaptchaChallenge = {
  id: string;
  question: string;
  expiresAt: string;
};

type LoginSuccess = {
  token: string;
  expiresAt: string | null;
  user: {
    id: string;
    email: string;
    emailVerifiedAt: string | null;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const shouldAutoRedirect = process.env.NEXT_PUBLIC_DISABLE_AUTO_REDIRECT !== "1";

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

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          captchaId: captcha.id,
          captchaAnswer,
        }),
      });

      const payload = (await response.json()) as LoginSuccess | { error: string };

      if (!response.ok) {
        setError((payload as { error: string }).error ?? "Login failed");
        void loadCaptcha();
        return;
      }

      setStatus("Login successful! Redirecting to dashboard...");

      if (shouldAutoRedirect) {
        setTimeout(() => {
          router.push("/dashboard");
        }, 600);
      }
    } catch (submitError) {
      console.error(submitError);
      setError("Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
      <div>
        <h1 className="text-2xl font-semibold">Log in</h1>
        <p className="mt-2 text-sm text-white/60">
          Authenticate with your verified email address to access the sync
          dashboard.
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
          />
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
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      {status && <p className="text-sm text-emerald-300">{status}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <p className="text-sm text-white/60">
        Need an account?{" "}
        <Link
          href="/register"
          className="font-semibold text-white underline-offset-4 hover:underline"
        >
          Register here
        </Link>
      </p>
    </section>
  );
}
