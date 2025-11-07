import { defineComponent, onMounted, ref } from "vue";
import { useRequestFetch } from "#imports";
import { NuxtLink } from "#components";

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

export default defineComponent({
  name: "RegisterPage",
  setup() {
    const requestFetch = useRequestFetch();

    const email = ref("");
    const password = ref("");
    const captcha = ref<CaptchaChallenge | null>(null);
    const captchaAnswer = ref("");
    const status = ref<string | null>(null);
    const error = ref<string | null>(null);
    const isSubmitting = ref(false);
    const verificationHint = ref<string | null>(null);

    const loadCaptcha = async () => {
      try {
        captchaAnswer.value = "";
        const payload = await requestFetch<{ challenge: CaptchaChallenge }>(
          "/api/captcha/challenge",
          {
            method: "POST",
            credentials: "include",
          }
        );

        captcha.value = payload.challenge;
      } catch (loadError) {
        console.error(loadError);
        error.value = "Failed to load captcha. Please refresh the page.";
      }
    };

    onMounted(() => {
      void loadCaptcha();
    });

    const handleSubmit = async (event: Event) => {
      event.preventDefault();

      if (!captcha.value) {
        error.value = "Captcha challenge has expired. Please refresh.";
        return;
      }

      isSubmitting.value = true;
      error.value = null;
      status.value = null;
      verificationHint.value = null;

      try {
        const payload = await requestFetch<RegisterResponse | { error: string }>(
          "/api/auth/register",
          {
            method: "POST",
            body: {
              email: email.value,
              password: password.value,
              captchaId: captcha.value.id,
              captchaAnswer: captchaAnswer.value,
            },
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          }
        );

        if ("error" in payload) {
          error.value = payload.error ?? "Registration failed";
          await loadCaptcha();
          return;
        }

        status.value = payload.message;

        if (payload.verificationToken) {
          verificationHint.value = `Development hint: verification token ${payload.verificationToken}`;
        }

        await loadCaptcha();
      } catch (submitError) {
        console.error(submitError);
        error.value = "Registration failed. Please try again.";
      } finally {
        isSubmitting.value = false;
      }
    };

    return () => (
      <section class="mx-auto w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
        <div>
          <h1 class="text-2xl font-semibold">Create an account</h1>
          <p class="mt-2 text-sm text-white/60">
            Register for the MyZ sync service. You will receive a verification link before you can log
            in.
          </p>
        </div>
        <form class="space-y-6" onSubmit={handleSubmit}>
          <div class="space-y-2">
            <label class="block text-sm text-white/70" for="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autocomplete="email"
              required
              value={email.value}
              onInput={(event) => (email.value = (event.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
            />
          </div>
          <div class="space-y-2">
            <label class="block text-sm text-white/70" for="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autocomplete="new-password"
              required
              minlength={8}
              value={password.value}
              onInput={(event) => (password.value = (event.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
            />
            <p class="text-xs text-white/50">
              Use at least 8 characters with upper, lower, and numeric symbols.
            </p>
          </div>
          <fieldset class="space-y-3 rounded-lg border border-dashed border-white/20 p-4">
            <legend class="px-2 text-sm text-white/70">Captcha</legend>
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm text-white">
                {captcha.value ? captcha.value.question : "Loading challenge..."}
              </span>
              <button
                type="button"
                onClick={() => void loadCaptcha()}
                class="rounded-md border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/60 hover:text-white"
              >
                Refresh
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="Answer"
              value={captchaAnswer.value}
              onInput={(event) => (captchaAnswer.value = (event.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
            />
          </fieldset>
          <button
            type="submit"
            disabled={isSubmitting.value}
            class="w-full rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting.value ? "Creating account..." : "Register"}
          </button>
        </form>
        {status.value && <p class="text-sm text-emerald-300">{status.value}</p>}
        {verificationHint.value && (
          <p class="text-xs text-emerald-200">{verificationHint.value}</p>
        )}
        {error.value && <p class="text-sm text-rose-300">{error.value}</p>}
        <p class="text-sm text-white/60">
          Already have an account?{" "}
          <NuxtLink
            to="/login"
            class="font-semibold text-white underline-offset-4 hover:underline"
          >
            Log in
          </NuxtLink>
        </p>
      </section>
    );
  },
});
