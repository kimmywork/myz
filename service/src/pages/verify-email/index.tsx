import { computed, defineComponent, ref } from "vue";
import { useRoute, useRequestFetch, definePageMeta } from "#imports";
import { NuxtLink } from "#components";

type VerifyResponse = {
  message: string;
  email: string;
  emailVerifiedAt: string | null;
};

type VerifyErrorPayload = {
  error?: string;
};

const DEFAULT_ERROR_MESSAGE = "Invalid or expired token";

export default defineComponent({
  name: "VerifyEmailPage",
  setup() {
    definePageMeta({ ssr: true });

    const route = useRoute();
    const requestFetch = useRequestFetch();

    const token = computed<string | null>(() => {
      const value = route.query.token;
      if (Array.isArray(value)) {
        return value[0] ?? null;
      }
      return typeof value === "string" ? value : null;
    });

    const email = ref("");
    const status = ref<string | null>(null);
    const error = ref<string | null>(null);
    const submitting = ref(false);
    const verified = ref(false);

    const verifyEmail = async () => {
      const tokenValue = token.value;
      if (!tokenValue) {
        error.value = "Missing verification token.";
        return;
      }

      const normalizedEmail = email.value.trim().toLowerCase();
      if (!normalizedEmail) {
        error.value = "Please enter the email address you used to register.";
        return;
      }

      submitting.value = true;
      status.value = null;
      error.value = null;

      try {
        const response = await requestFetch<VerifyResponse | VerifyErrorPayload>(
          "/api/auth/verify-email",
          {
            method: "POST",
            body: { token: tokenValue, email: normalizedEmail },
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            throw: false,
          }
        );

        if (!response?.email) {
          error.value = DEFAULT_ERROR_MESSAGE;
          return;
        }

        email.value = response.email;
        status.value = `Email ${response.email} verified successfully.`;
        verified.value = true;
      } catch (requestError) {
        console.error("[verify-email] verification failed", requestError);
        error.value = DEFAULT_ERROR_MESSAGE;
      } finally {
        submitting.value = false;
      }
    };

    const handleSubmit = (event: Event) => {
      event.preventDefault();
      if (submitting.value || verified.value) {
        return;
      }
      void verifyEmail();
    };

    return () => (
      <section class="mx-auto w-full max-w-lg space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
        <h1 class="text-2xl font-semibold">Verify email</h1>
        {token.value ? (
          <p class="text-sm text-white/60">
            Enter the email you used to register to confirm token <code class="font-mono">{token.value}</code>
          </p>
        ) : (
          <p class="text-sm text-white/60">
            Verification token missing. Please open the link provided in your email.
          </p>
        )}
        {status.value && <p class="text-sm text-emerald-300">{status.value}</p>}
        {error.value && <p class="text-sm text-rose-300">{error.value}</p>}
        <form class="space-y-4" onSubmit={handleSubmit}>
          <label class="block space-y-2" for="verify-email-input">
            <span class="text-sm font-medium text-white">Email address</span>
            <input
              id="verify-email-input"
              type="email"
              class="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-base text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
              value={email.value}
              onInput={(event) => {
                email.value = (event.target as HTMLInputElement).value;
              }}
              required
              disabled={submitting.value || verified.value}
            />
          </label>
          <button
            type="submit"
            class="w-full rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/70"
            disabled={submitting.value || verified.value}
          >
            {verified.value ? "Email verified" : submitting.value ? "Verifying..." : "Verify email"}
          </button>
        </form>
        <p class="text-sm text-white/60">
          Ready to continue?{" "}
          <NuxtLink
            to="/login"
            class="font-semibold text-white underline-offset-4 hover:underline"
          >
            Return to login
          </NuxtLink>
        </p>
      </section>
    );
  },
});
