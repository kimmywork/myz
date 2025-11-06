import { computed, defineComponent, onMounted, ref } from "vue";
import { navigateTo, useRuntimeConfig, useRequestFetch, useCookie } from "#imports";
import { NuxtLink } from "#components";

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

export default defineComponent({
  name: "LoginPage",
  setup() {
    const runtimeConfig = useRuntimeConfig();
    const requestFetch = useRequestFetch();
    const sessionToken = useCookie<string | null>("myz_session_token", {
      sameSite: "lax",
      path: "/",
    });

    const email = ref("");
    const password = ref("");
    const captcha = ref<CaptchaChallenge | null>(null);
    const captchaAnswer = ref("");
    const status = ref<string | null>(null);
    const error = ref<string | null>(null);
    const isSubmitting = ref(false);

    const shouldAutoRedirect = computed(
      () => runtimeConfig.public.disableAutoRedirect !== "1"
    );

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

      try {
        const payload = await requestFetch<LoginSuccess | { error: string }>(
          "/api/auth/login",
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
          error.value = payload.error ?? "Login failed";
          await loadCaptcha();
          return;
        }

        sessionToken.value = payload.token;
        status.value = "Login successful! Redirecting to dashboard...";

        if (shouldAutoRedirect.value) {
          window.setTimeout(() => {
            void navigateTo("/dashboard");
          }, 600);
        }
      } catch (submitError) {
        console.error(submitError);
        error.value = "Login failed. Please try again.";
      } finally {
        isSubmitting.value = false;
      }
    };

    return () => (
      <section class="mx-auto w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
        <div>
          <h1 class="text-2xl font-semibold">Log in</h1>
          <p class="mt-2 text-sm text-white/60">
            Authenticate with your verified email address to access the sync dashboard.
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
              autocomplete="current-password"
              required
              value={password.value}
              onInput={(event) => (password.value = (event.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-white outline-none focus:border-white/60"
            />
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
            {isSubmitting.value ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {status.value && <p class="text-sm text-emerald-300">{status.value}</p>}
        {error.value && <p class="text-sm text-rose-300">{error.value}</p>}
        <p class="text-sm text-white/60">
          Need an account?{" "}
          <NuxtLink
            to="/register"
            class="font-semibold text-white underline-offset-4 hover:underline"
          >
            Register here
          </NuxtLink>
        </p>
      </section>
    );
  },
});
