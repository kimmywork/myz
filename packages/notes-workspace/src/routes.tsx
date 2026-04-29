import type {
  DashboardHost,
  DashboardHostCapabilities,
  DashboardHostKind,
  DashboardTheme,
  SyncConfig,
  SyncRunResult,
  SyncStatus,
} from "@myz/dashboard-core/host"
import type { MyZRecord } from "@myz/shared/types"
import { computed, defineComponent, onMounted, ref } from "vue"
import {
  RouterLink,
  RouterView,
  useRoute,
  type RouteRecordRaw,
} from "vue-router"

export interface NotesWorkspaceOptions {
  appName: string
  hostKind: DashboardHostKind
  capabilities: DashboardHostCapabilities
  host: DashboardHost
}

interface NotesNavItem {
  key: string
  label: string
  to: string
  description: string
}

const notesNavItems: NotesNavItem[] = [
  {
    key: "records",
    label: "记录",
    to: "/records",
    description: "笔记、高亮与摘要列表",
  },
  {
    key: "settings",
    label: "设置",
    to: "/settings",
    description: "偏好、主题与本地行为",
  },
  {
    key: "sync",
    label: "同步",
    to: "/sync",
    description: "本地文件与远端同步适配",
  },
]

function createWorkspaceShell(options: NotesWorkspaceOptions) {
  return defineComponent({
    name: "NotesWorkspaceShell",
    setup() {
      const route = useRoute()

      return () => (
        <div class="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-10">
          <div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <header class="rounded-3xl border border-slate-200 bg-white/95 px-6 py-5 shadow-xl dark:border-white/10 dark:bg-slate-900/70">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div class="space-y-2">
                  <div class="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200">
                    shared notes workspace
                  </div>
                  <div>
                    <h1 class="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                      {options.appName}
                    </h1>
                    <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      Shared dashboard shell for records, settings, and sync.
                      The host-specific storage and transport layers stay behind
                      repository interfaces.
                    </p>
                  </div>
                </div>

                <div class="grid gap-2 sm:grid-cols-3">
                  <CapabilityBadge
                    label="Host"
                    value={options.hostKind}
                    enabled={true}
                  />
                  <CapabilityBadge
                    label="Local files"
                    value={
                      options.capabilities.localFileStorage ? "enabled" : "off"
                    }
                    enabled={options.capabilities.localFileStorage}
                  />
                  <CapabilityBadge
                    label="Sync"
                    value={options.capabilities.sync ? "enabled" : "off"}
                    enabled={options.capabilities.sync}
                  />
                </div>
              </div>

              <nav class="mt-5 flex flex-wrap gap-2">
                {notesNavItems.map((item) => {
                  const active = route.path === item.to
                  return (
                    <RouterLink
                      key={item.key}
                      to={item.to}
                      class={[
                        "rounded-full px-4 py-2 text-sm font-medium transition",
                        active
                          ? "bg-indigo-600 text-white shadow"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
                      ].join(" ")}
                    >
                      {item.label}
                    </RouterLink>
                  )
                })}
              </nav>
            </header>

            <main class="min-w-0">
              <RouterView />
            </main>
          </div>
        </div>
      )
    },
  })
}

function CapabilityBadge(props: {
  label: string
  value: string
  enabled: boolean
}) {
  return (
    <div
      class={[
        "rounded-2xl border px-4 py-3 text-sm",
        props.enabled
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-200"
          : "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
      ].join(" ")}
    >
      <div class="text-xs uppercase tracking-wide opacity-80">{props.label}</div>
      <div class="mt-1 font-semibold">{props.value}</div>
    </div>
  )
}

function createRecordsPage(options: NotesWorkspaceOptions) {
  return defineComponent({
    name: "NotesWorkspaceRecordsPage",
    setup() {
      const records = ref<MyZRecord[]>([])
      const loading = ref(true)
      const error = ref("")

      async function loadRecords() {
        loading.value = true
        error.value = ""
        try {
          records.value = await options.host.records.listRecords()
        } catch (loadError) {
          error.value =
            loadError instanceof Error ? loadError.message : "Failed to load records."
        } finally {
          loading.value = false
        }
      }

      onMounted(() => {
        void loadRecords()
      })

      const recordCountLabel = computed(() =>
        loading.value ? "Loading..." : `${records.value.length} records`,
      )

      return () => (
        <section class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <article class="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl dark:border-white/10 dark:bg-slate-900/60">
            <div class="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
                  记录工作区
                </h2>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {recordCountLabel.value}
                </p>
              </div>
              <button
                type="button"
                class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:text-slate-200 dark:hover:border-indigo-300 dark:hover:text-indigo-200"
                onClick={() => {
                  void loadRecords()
                }}
              >
                刷新
              </button>
            </div>
            <p class="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This shared pane is the future home for the extracted highlights,
              notes, and summary list from the annotator dashboard.
            </p>

            {error.value ? (
              <p class="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                {error.value}
              </p>
            ) : null}

            <div class="mt-5 grid gap-4">
              {loading.value ? (
                <InfoCard
                  title="Loading records"
                  description="The desktop host is reading notes from local files through the shared record repository."
                />
              ) : records.value.length ? (
                records.value.map((record) => (
                  <article
                    key={record.id}
                    class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                  >
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="space-y-2">
                        <h3 class="text-base font-semibold text-slate-900 dark:text-white">
                          {record.title || record.text.slice(0, 48) || "Untitled record"}
                        </h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400">
                          {record.kind} · {record.hostname || "local"}
                        </p>
                      </div>
                      <span class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 dark:border-white/10 dark:text-slate-300">
                        {record.updatedAt}
                      </span>
                    </div>
                    <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {record.note || record.text}
                    </p>
                    {record.tags?.length ? (
                      <div class="mt-3 flex flex-wrap gap-2">
                        {record.tags.map((tag) => (
                          <span
                            key={tag}
                            class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <InfoCard
                  title="No records yet"
                  description="The connected host repository returned no notes, highlights, or summaries."
                />
              )}
            </div>
          </article>

          <article class="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl dark:border-white/10 dark:bg-slate-900/60">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              Extraction targets
            </h3>
            <ul class="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li>• highlights list and filter toolbar</li>
              <li>• page / source grouping sidebar</li>
              <li>• record detail viewer and metadata blocks</li>
              <li>• import/export controls backed by repository interfaces</li>
            </ul>
          </article>
        </section>
      )
    },
  })
}

function createSettingsPage(options: NotesWorkspaceOptions) {
  return defineComponent({
    name: "NotesWorkspaceSettingsPage",
    setup() {
      const settings = ref<unknown>(null)
      const theme = ref<DashboardTheme>("dark")
      const loading = ref(true)
      const error = ref("")

      async function loadSettings() {
        loading.value = true
        error.value = ""
        try {
          const [nextSettings, nextTheme] = await Promise.all([
            options.host.settings.getSettings(),
            options.host.theme.getTheme(),
          ])
          settings.value = nextSettings
          theme.value = nextTheme === "light" ? "light" : "dark"
        } catch (loadError) {
          error.value =
            loadError instanceof Error ? loadError.message : "Failed to load settings."
        } finally {
          loading.value = false
        }
      }

      async function toggleTheme() {
        const nextTheme: DashboardTheme = theme.value === "dark" ? "light" : "dark"
        await options.host.theme.setTheme(nextTheme)
        theme.value = nextTheme
      }

      onMounted(() => {
        void loadSettings()
      })

      return () => (
        <section class="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl dark:border-white/10 dark:bg-slate-900/60">
          <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
            设置工作区
          </h2>
          <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Settings will be routed through a host-neutral repository so the UI
            can keep one structure while each host persists data differently.
          </p>

          <div class="mt-5 grid gap-4 md:grid-cols-3">
            <InfoCard
              title="Theme"
              description={`Current theme: ${theme.value}. Theme persistence is now handled through a shared repository contract.`}
            />
            <InfoCard
              title="Preferences"
              description="Share dashboard preferences like list mode, palettes, and filters across hosts with one settings shape."
            />
            <InfoCard
              title="Host"
              description={`Current host preset: ${options.hostKind}.`}
            />
          </div>

          <div class="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:text-slate-200 dark:hover:border-indigo-300 dark:hover:text-indigo-200"
              onClick={() => {
                void loadSettings()
              }}
            >
              刷新设置
            </button>
            <button
              type="button"
              class="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-indigo-500"
              onClick={() => {
                void toggleTheme()
              }}
            >
              切换主题
            </button>
          </div>

          {error.value ? (
            <p class="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
              {error.value}
            </p>
          ) : null}

          <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
              Settings payload
            </h3>
            <pre class="mt-3 overflow-x-auto text-xs leading-6 text-slate-600 dark:text-slate-300">
              {loading.value
                ? "Loading settings..."
                : JSON.stringify(settings.value, null, 2)}
            </pre>
          </div>
        </section>
      )
    },
  })
}

function createSyncPage(options: NotesWorkspaceOptions) {
  return defineComponent({
    name: "NotesWorkspaceSyncPage",
    setup() {
      const syncConfig = ref<SyncConfig | null>(null)
      const syncStatus = ref<SyncStatus | null>(null)
      const syncResult = ref<SyncRunResult | null>(null)
      const loading = ref(true)
      const running = ref(false)
      const error = ref("")

      async function loadSync() {
        loading.value = true
        error.value = ""
        try {
          if (!options.host.sync) {
            syncConfig.value = null
            syncStatus.value = null
            return
          }
          const [nextConfig, nextStatus] = await Promise.all([
            options.host.sync.getConfig(),
            options.host.sync.getStatus(),
          ])
          syncConfig.value = nextConfig
          syncStatus.value = nextStatus
        } catch (loadError) {
          error.value =
            loadError instanceof Error ? loadError.message : "Failed to load sync state."
        } finally {
          loading.value = false
        }
      }

      async function runSyncNow() {
        if (!options.host.sync) {
          return
        }
        running.value = true
        error.value = ""
        try {
          syncResult.value = await options.host.sync.runSync("manual")
          await loadSync()
        } catch (runError) {
          error.value =
            runError instanceof Error ? runError.message : "Failed to run sync."
        } finally {
          running.value = false
        }
      }

      onMounted(() => {
        void loadSync()
      })

      return () => (
        <section class="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl dark:border-white/10 dark:bg-slate-900/60">
          <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
            同步工作区
          </h2>
          <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Sync is modeled as a host capability. Desktop keeps local files as
            the primary store and still exposes sync configuration and execution
            through the same shared contract.
          </p>

          <div class="mt-5 grid gap-4 md:grid-cols-3">
            <InfoCard
              title="Primary storage"
              description={
                options.capabilities.localFileStorage
                  ? "Local files are the source of truth for desktop records and settings."
                  : "This host uses a non-file primary store."
              }
            />
            <InfoCard
              title="Sync adapter"
              description={
                options.capabilities.sync
                  ? "A sync repository can expose config, status, and manual runs without leaking host-specific transport code into the UI."
                  : "This host preset does not expose sync."
              }
            />
            <InfoCard
              title="Future target"
              description="Map the existing annotator sync settings surface onto the shared sync repository."
            />
          </div>

          <div class="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:text-slate-200 dark:hover:border-indigo-300 dark:hover:text-indigo-200"
              onClick={() => {
                void loadSync()
              }}
            >
              刷新状态
            </button>
            <button
              type="button"
              class="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={!options.host.sync || running.value}
              onClick={() => {
                void runSyncNow()
              }}
            >
              {running.value ? "同步中..." : "立即同步"}
            </button>
          </div>

          {error.value ? (
            <p class="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
              {error.value}
            </p>
          ) : null}

          <div class="mt-5 grid gap-4 lg:grid-cols-2">
            <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
                Sync config
              </h3>
              <pre class="mt-3 overflow-x-auto text-xs leading-6 text-slate-600 dark:text-slate-300">
                {loading.value
                  ? "Loading sync config..."
                  : JSON.stringify(syncConfig.value, null, 2)}
              </pre>
            </article>
            <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
                Sync status
              </h3>
              <pre class="mt-3 overflow-x-auto text-xs leading-6 text-slate-600 dark:text-slate-300">
                {loading.value
                  ? "Loading sync status..."
                  : JSON.stringify(
                      {
                        status: syncStatus.value,
                        lastRun: syncResult.value,
                      },
                      null,
                      2,
                    )}
              </pre>
            </article>
          </div>
        </section>
      )
    },
  })
}

function InfoCard(props: { title: string; description: string }) {
  return (
    <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
        {props.title}
      </h3>
      <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {props.description}
      </p>
    </article>
  )
}

export function createNotesWorkspaceRoutes(
  options: NotesWorkspaceOptions,
): RouteRecordRaw[] {
  return [
    {
      path: "/",
      component: createWorkspaceShell(options),
      children: [
        {
          path: "",
          redirect: "/records",
        },
        {
          path: "records",
          name: "notes-records",
          component: createRecordsPage(options),
        },
        {
          path: "settings",
          name: "notes-settings",
          component: createSettingsPage(options),
        },
        {
          path: "sync",
          name: "notes-sync",
          component: createSyncPage(options),
        },
      ],
    },
  ]
}
