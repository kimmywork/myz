import { defineComponent, onMounted, ref } from "vue";
import { useRequestFetch, useCookie, navigateTo, definePageMeta } from "#imports";
import { NuxtLink } from "#components";
import type { FetchError } from "ofetch";

import type { SyncSnapshot } from "@/lib/sync";

type SessionUserPayload = {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  lastSyncAt: string | null;
  status: string;
};

type SyncHistoryEntry = {
  id: string;
  version: number;
  status: string;
  summary: string | null;
  syncedAt: Date;
};

type DashboardUser = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  lastSyncAt: Date | null;
  status: string;
};

const normalizeUser = (
  raw:
    | SessionUserPayload
    | {
        id: string;
        email: string;
        status: string;
        emailVerifiedAt: Date | null;
        lastSyncAt: Date | null;
      }
): DashboardUser => ({
  id: raw.id,
  email: raw.email,
  status: raw.status,
  emailVerifiedAt:
    raw.emailVerifiedAt instanceof Date
      ? raw.emailVerifiedAt
      : raw.emailVerifiedAt
        ? new Date(raw.emailVerifiedAt)
        : null,
  lastSyncAt:
    raw.lastSyncAt instanceof Date
      ? raw.lastSyncAt
      : raw.lastSyncAt
        ? new Date(raw.lastSyncAt)
        : null,
});

const normalizeHistory = (
  items: Array<{
    id: string;
    version: number;
    status: string;
    summary: string | null;
    syncedAt: Date | string;
  }>
): SyncHistoryEntry[] =>
  items.map((entry) => ({
    id: entry.id,
    version: entry.version,
    status: entry.status,
    summary: entry.summary ?? null,
    syncedAt: entry.syncedAt instanceof Date ? entry.syncedAt : new Date(entry.syncedAt),
  }));

export default defineComponent({
  name: "DashboardPage",
  setup() {
    definePageMeta({ ssr: false });

    const requestFetch = useRequestFetch();
    const sessionToken = useCookie<string | null>("myz_session_token");
    const isLoading = ref(true);
    const errorMessage = ref<string | null>(null);
    const user = ref<DashboardUser | null>(null);
    const history = ref<SyncHistoryEntry[]>([]);
    const snapshot = ref<SyncSnapshot | null>(null);

    const authHeaders = () =>
      sessionToken.value
        ? {
            Authorization: `Bearer ${sessionToken.value}`,
          }
        : {};

    const loadDashboard = async () => {
      try {
        const sessionResponse = await requestFetch<{ user: SessionUserPayload }>(
          "/api/auth/session",
          {
            credentials: "include",
            headers: authHeaders(),
          }
        );

        user.value = normalizeUser(sessionResponse.user);

        const [historyResponse, snapshotResponse] = await Promise.all([
          requestFetch<{
            history: Array<{
              id: string;
              version: number;
              status: string;
              summary: string | null;
              syncedAt: string;
            }>;
          }>("/api/sync/history", { credentials: "include", headers: authHeaders() }),
          requestFetch<{ snapshot: SyncSnapshot }>("/api/sync/snapshot", {
            credentials: "include",
            headers: authHeaders(),
          }),
        ]);

        history.value = normalizeHistory(historyResponse.history);
        snapshot.value = snapshotResponse.snapshot ?? null;
      } catch (loadError) {
        const status = (loadError as FetchError)?.status;
        if (status === 401 || status === 403) {
          await navigateTo("/login", { replace: true });
          return;
        }

        console.error("[dashboard] failed to load", loadError);
        errorMessage.value = "Unable to load dashboard data. Please try again.";
      } finally {
        isLoading.value = false;
      }
    };

    onMounted(() => {
      void loadDashboard();
    });

    return () => {
      if (isLoading.value) {
        return (
          <section class="flex min-h-[40vh] items-center justify-center text-sm text-white/60">
            Loading dashboard...
          </section>
        );
      }

      if (errorMessage.value) {
        return (
          <section class="mx-auto w-full max-w-xl space-y-4 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-sm text-white">
            <p>{errorMessage.value}</p>
            <button
              type="button"
              class="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 transition hover:border-white/60"
              onClick={() => {
                errorMessage.value = null;
                isLoading.value = true;
                void loadDashboard();
              }}
            >
              Retry
            </button>
          </section>
        );
      }

      const currentUser = user.value;

      if (!currentUser) {
        return null;
      }

      const historyEntries = history.value;
      const snapshotPayload = snapshot.value;

      return (
      <section class="space-y-10">
        <header class="rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
          <h1 class="text-2xl font-semibold">Welcome back, {currentUser.email}</h1>
          <p class="mt-2 text-sm text-white/60">
            Your data will synchronize automatically whenever the browser extension connects. Use this
            dashboard to audit the latest changes.
          </p>
          <div class="mt-6 flex flex-wrap gap-4 text-sm text-white/60">
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
              <span class="text-xs uppercase text-white/40">Status</span>
              <p class="text-sm text-white">
                {currentUser.emailVerifiedAt ? "Email verified" : "Verification pending"}
              </p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
              <span class="text-xs uppercase text-white/40">Last sync</span>
              <p class="text-sm text-white">
                {currentUser.lastSyncAt ? currentUser.lastSyncAt.toString() : "No sync recorded"}
              </p>
            </div>
          </div>
        </header>

        <section class="grid gap-6 lg:grid-cols-2">
          <div class="h-full rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
            <h2 class="text-lg font-semibold">Recent sync runs</h2>
            <p class="mt-2 text-xs text-white/60">
              Showing the most recent {historyEntries.length} server-side sync logs.
            </p>
            <ul class="mt-4 space-y-3">
              {historyEntries.length === 0 && (
                <li class="text-sm text-white/60">No sync activity yet.</li>
              )}
              {historyEntries.map((entry) => (
                <li
                  key={entry.id}
                  class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-white/80">
                      v{entry.version} — {entry.status}
                    </span>
                    <span class="text-xs text-white/50">{entry.syncedAt.toString()}</span>
                  </div>
                  {entry.summary && <p class="mt-2 text-xs text-white/60">{entry.summary}</p>}
                </li>
              ))}
            </ul>
          </div>
          <div class="h-full rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
            <h2 class="text-lg font-semibold">Latest snapshot</h2>
            <p class="mt-2 text-xs text-white/60">
              Data stored on the server after the most recent successful sync.
            </p>
            <pre class="mt-4 max-h-96 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-white/80">
              {JSON.stringify(snapshotPayload ?? { annotations: {} }, null, 2)}
            </pre>
          </div>
        </section>

        <footer class="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
          <div>
            Need a fresh captcha or want to test the API manually? Use the endpoints documented under
            <code>/knowledges</code>.
          </div>
          <NuxtLink
            to="/api/sync/history"
            class="rounded-full border border-white/20 px-4 py-2 text-white transition hover:border-white/60"
          >
            Download history JSON
          </NuxtLink>
        </footer>
      </section>
      );
    };
  },
});
