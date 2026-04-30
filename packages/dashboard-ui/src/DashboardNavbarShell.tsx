import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue"
import type { PropType, VNodeChild } from "vue"
import { RouterLink } from "vue-router"

export type DashboardNavbarTab = {
  key: string
  label: string
  to: string
}

export default defineComponent({
  name: "DashboardNavbarShell",
  props: {
    title: {
      type: String,
      default: "MyZ 智能助理",
    },
    tabs: {
      type: Array as PropType<DashboardNavbarTab[]>,
      required: true,
    },
    activeKey: {
      type: String,
      required: true,
    },
    isHighlightsRoute: {
      type: Boolean,
      default: false,
    },
    quickSearch: {
      type: String,
      default: "",
    },
    availableTags: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    availableSites: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    searchPlaceholder: {
      type: String,
      default: "搜索/标签/网站",
    },
    tabAriaLabelByKey: {
      type: Object as PropType<Record<string, string>>,
      default: () => ({}),
    },
    onApplyQuickSearch: Function as PropType<(value: string) => void>,
    onResetFilters: Function as PropType<() => void>,
    renderThemeToggle: Function as PropType<() => VNodeChild>,
  },
  setup(props) {
    const searchWrapperRef = ref<HTMLElement | null>(null)
    const searchInputRef = ref<HTMLInputElement | null>(null)
    const dropdownOpen = ref(false)
    const inputFocused = ref(false)

    const hasInput = computed(() => Boolean(props.quickSearch.trim()))
    const normalizedQuery = computed(() => {
      const raw = props.quickSearch.trim()
      if (!raw) return ""
      if (raw.toLowerCase().startsWith("site:")) {
        return raw.slice(5).trim().toLowerCase()
      }
      return raw.startsWith("#")
        ? raw.slice(1).trim().toLowerCase()
        : raw.toLowerCase()
    })
    const queryPrefersSite = computed(() =>
      props.quickSearch.trim().toLowerCase().startsWith("site:"),
    )
    const queryPrefersTag = computed(() => props.quickSearch.trim().startsWith("#"))

    const suggestions = computed(() => {
      const query = normalizedQuery.value
      const list: Array<{
        value: string
        label: string
        type: "tag" | "site"
        score: number
      }> = []

      const pushItem = (value: string, type: "tag" | "site") => {
        const candidate = value.toLowerCase()
        let score = 3
        if (query) {
          if (candidate === query) {
            score = 0
          } else if (candidate.startsWith(query)) {
            score = 1
          } else if (candidate.includes(query)) {
            score = 2
          } else {
            return
          }
        }
        if (queryPrefersTag.value && type === "tag") {
          score -= 0.2
        }
        if (queryPrefersSite.value && type === "site") {
          score -= 0.2
        }
        list.push({
          value,
          label: type === "tag" ? `#${value}` : value,
          type,
          score,
        })
      }

      props.availableTags.forEach((tag) => pushItem(tag, "tag"))
      props.availableSites.forEach((site) => pushItem(site, "site"))

      return list
        .sort((a, b) =>
          a.score === b.score ? a.label.localeCompare(b.label) : a.score - b.score,
        )
        .slice(0, 10)
    })

    const showSuggestions = computed(() => {
      if (!suggestions.value.length) {
        return false
      }
      if (dropdownOpen.value) {
        return true
      }
      return hasInput.value && inputFocused.value
    })

    function closeDropdown() {
      dropdownOpen.value = false
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!dropdownOpen.value) {
        return
      }
      const target = event.target as Node
      if (searchWrapperRef.value?.contains(target)) {
        return
      }
      closeDropdown()
    }

    function toggleDropdown() {
      dropdownOpen.value = !dropdownOpen.value
      if (dropdownOpen.value) {
        searchInputRef.value?.focus()
      }
    }

    function handleSuggestionSelect(item: { value: string; type: "tag" | "site" }) {
      props.onApplyQuickSearch?.(
        item.type === "tag" ? `#${item.value}` : `site:${item.value}`,
      )
      closeDropdown()
    }

    function handleInput(event: InputEvent) {
      props.onApplyQuickSearch?.((event.target as HTMLInputElement).value)
    }

    function handleReset() {
      props.onResetFilters?.()
      closeDropdown()
    }

    onMounted(() => {
      document.addEventListener("click", handleDocumentClick)
    })

    onBeforeUnmount(() => {
      document.removeEventListener("click", handleDocumentClick)
    })

    return () => (
      <nav class="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white/80 px-6 py-4 text-slate-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:text-white">
        <div class="text-lg font-semibold">{props.title}</div>
        <div class="flex flex-1 flex-wrap items-center gap-2">
          {props.tabs.map((tab) => {
            const active = props.activeKey === tab.key
            return (
              <RouterLink
                key={tab.key}
                to={tab.to}
                class={[
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                  active
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white",
                ].join(" ")}
                aria-label={props.tabAriaLabelByKey[tab.key]}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </RouterLink>
            )
          })}
        </div>
        {props.isHighlightsRoute ? (
          <div class="relative w-full max-w-md flex-1" ref={searchWrapperRef}>
            <div class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
              <input
                ref={searchInputRef}
                type="search"
                class="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder={props.searchPlaceholder}
                value={props.quickSearch}
                onInput={handleInput}
                onFocus={() => {
                  inputFocused.value = true
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    inputFocused.value = false
                  }, 100)
                }}
              />
              <button
                type="button"
                class="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-white"
                aria-label="打开搜索建议"
                onClick={toggleDropdown}
              >
                ▼
              </button>
              {props.quickSearch ? (
                <button
                  type="button"
                  class="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-white"
                  aria-label="重置筛选"
                  onClick={handleReset}
                >
                  ×
                </button>
              ) : null}
            </div>
            {showSuggestions.value ? (
              <div class="absolute left-0 right-0 z-30 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl dark:border-white/10 dark:bg-slate-900/90">
                {suggestions.value.map((item) => (
                  <button
                    key={`${item.type}:${item.value}`}
                    type="button"
                    class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-500/10"
                    onMousedown={(event) => event.preventDefault()}
                    onClick={() => handleSuggestionSelect(item)}
                  >
                    <span class="truncate">{item.label}</span>
                    <span class="ml-2 text-xs text-slate-400">
                      {item.type === "tag" ? "标签" : "网站"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div class="ml-auto flex items-center">{props.renderThemeToggle?.()}</div>
      </nav>
    )
  },
})
