import { ChevronDown, X } from "@lucide/vue"
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
      default: "MyZ",
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
      <nav class="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-surface/80 px-6 py-4 text-text  backdrop-blur dark:border-line dark:bg-surface dark:text-text">
        <div class="text-title font-semibold">{props.title}</div>
        <div class="flex flex-1 flex-wrap items-center gap-2">
          {props.tabs.map((tab) => {
            const active = props.activeKey === tab.key
            return (
              <RouterLink
                key={tab.key}
                to={tab.to}
                class={[
                  "rounded-full px-4 py-1.5 text-compact font-semibold transition",
                  active
                    ? "bg-accent text-on-accent "
                    : "text-muted hover:text-text dark:text-muted dark:hover:text-text",
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
            <div class="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-compact text-text  dark:border-line dark:bg-surface dark:text-text">
              <input
                ref={searchInputRef}
                type="search"
                class="w-full bg-transparent text-compact outline-none placeholder:text-muted"
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
                class="text-muted transition hover:text-accent-text"
                aria-label="打开搜索建议"
                onClick={toggleDropdown}
              >
                <ChevronDown size={16} />
              </button>
              {props.quickSearch ? (
                <button
                  type="button"
                  class="text-muted transition hover:text-accent-text"
                  aria-label="重置筛选"
                  onClick={handleReset}
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
            {showSuggestions.value ? (
              <div class="absolute left-0 right-0 z-30 mt-2 max-h-56 overflow-y-auto rounded-panel border border-control-border bg-surface p-1 text-label shadow-float">
                {suggestions.value.map((item) => (
                  <button
                    key={`${item.type}:${item.value}`}
                    type="button"
                    class="flex h-8 w-full items-center justify-between rounded-tag px-2.5 text-left text-text transition hover:bg-surface-2"
                    onMousedown={(event) => event.preventDefault()}
                    onClick={() => handleSuggestionSelect(item)}
                  >
                    <span class="truncate">{item.label}</span>
                    <span class="ml-2 text-caption text-muted">
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
