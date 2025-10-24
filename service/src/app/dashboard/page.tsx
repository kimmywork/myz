import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserFromCookies } from "@/lib/auth/server";
import { readSnapshot } from "@/lib/storage";
import type { SyncSnapshot } from "@/lib/sync";
import { listSyncHistory } from "@/services/user-service";

export default async function DashboardPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  const [history, snapshot] = await Promise.all([
    listSyncHistory(user.id, 15),
    readSnapshot<SyncSnapshot>(user.id),
  ]);

  return (
    <section className="space-y-10">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white">
        <h1 className="text-2xl font-semibold">Welcome back, {user.email}</h1>
        <p className="mt-2 text-sm text-white/60">
          Your data will synchronize automatically whenever the browser
          extension connects. Use this dashboard to audit the latest changes.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-white/60">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
            <span className="text-xs uppercase text-white/40">Status</span>
            <p className="text-sm text-white">
              {user.emailVerifiedAt ? "Email verified" : "Verification pending"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
            <span className="text-xs uppercase text-white/40">Last sync</span>
            <p className="text-sm text-white">
              {user.lastSyncAt
                ? user.lastSyncAt.toString()
                : "No sync recorded"}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="h-full rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
          <h2 className="text-lg font-semibold">Recent sync runs</h2>
          <p className="mt-2 text-xs text-white/60">
            Showing the most recent {history.length} server-side sync logs.
          </p>
          <ul className="mt-4 space-y-3">
            {history.length === 0 && (
              <li className="text-sm text-white/60">No sync activity yet.</li>
            )}
            {history.map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white/80">
                    v{entry.version} — {entry.status}
                  </span>
                  <span className="text-xs text-white/50">
                    {entry.syncedAt.toString()}
                  </span>
                </div>
                {entry.summary && (
                  <p className="mt-2 text-xs text-white/60">{entry.summary}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="h-full rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
          <h2 className="text-lg font-semibold">Latest snapshot</h2>
          <p className="mt-2 text-xs text-white/60">
            Data stored on the server after the most recent successful sync.
          </p>
          <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-white/80">
            {JSON.stringify(snapshot ?? { annotations: {} }, null, 2)}
          </pre>
        </div>
      </section>

      <footer className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        <div>
          Need a fresh captcha or want to test the API manually? Use the
          endpoints documented under <code>/knowledges</code>.
        </div>
        <Link
          href="/api/sync/history"
          className="rounded-full border border-white/20 px-4 py-2 text-white transition hover:border-white/60"
        >
          Download history JSON
        </Link>
      </footer>
    </section>
  );
}
