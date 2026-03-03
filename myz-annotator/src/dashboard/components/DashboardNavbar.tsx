import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import ThemeToggle from "@/shared/components/ThemeToggle.jsx";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "DashboardNavbar",
  setup() {
    const route = useRoute();
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const searchWrapperRef = ref<HTMLElement | null>(null);
    const searchInputRef = ref<HTMLInputElement | null>(null);
    const dropdownOpen = ref(false);
    const inputFocused = ref(false);
    const tabs = [
      {
        key: "highlights",
        label: "标注列表",
        to: "/highlights",
        isActive: (path: string) => path.startsWith("/highlights"),
      },
      {
        key: "chat",
        label: "聊天",
        to: "/chat",
        isActive: (path: string) => path.startsWith("/chat"),
      },
      {
        key: "settings",
        label: "设置",
        to: "/settings",
        isActive: (path: string) => path.startsWith("/settings"),
      },
    ];
    const activeKey = computed(() => {
      const path = route.path || "";
      return tabs.find((tab) => tab.isActive(path))?.key ?? "highlights";
    });
    const isHighlightsRoute = computed(() => (route.path || "") === "/highlights");
    const hasInput = computed(() => Boolean(uiStore.quickSearch.trim()));
    const normalizedQuery = computed(() => {
      const raw = uiStore.quickSearch.trim();
      if (!raw) return "";
      if (raw.toLowerCase().startsWith("site:")) {
        return raw.slice(5).trim().toLowerCase();
      }
      return raw.startsWith("#") ? raw.slice(1).trim().toLowerCase() : raw.toLowerCase();
    });
    const queryPrefersSite = computed(() =>
      uiStore.quickSearch.trim().toLowerCase().startsWith("site:"),
    );
    const queryPrefersTag = computed(() =>
      uiStore.quickSearch.trim().startsWith("#"),
    );
    const suggestions = computed(() => {
      const query = normalizedQuery.value;
      const list: Array<{
        value: string;
        label: string;
        type: "tag" | "site";
        score: number;
      }> = [];

      const pushItem = (value: string, type: "tag" | "site") => {
        const candidate = value.toLowerCase();
        let score = 3;
        if (query) {
          if (candidate === query) {
            score = 0;
          } else if (candidate.startsWith(query)) {
            score = 1;
          } else if (candidate.includes(query)) {
            score = 2;
          } else {
            return;
          }
        }
        if (queryPrefersTag.value && type === "tag") {
          score -= 0.2;
        }
        if (queryPrefersSite.value && type === "site") {
          score -= 0.2;
        }
        list.push({
          value,
          label: type === "tag" ? `#${value}` : value,
          type,
          score,
        });
      };

      highlightsStore.availableTags.forEach((tag) => pushItem(tag, "tag"));
      highlightsStore.availableSites.forEach((site) => pushItem(site, "site"));

      return list
        .sort((a, b) =>
          a.score === b.score ? a.label.localeCompare(b.label) : a.score - b.score,
        )
        .slice(0, 10);
    });
    const showSuggestions = computed(() => {
      if (!suggestions.value.length) {
        return false;
      }
      if (dropdownOpen.value) {
        return true;
      }
      return hasInput.value && inputFocused.value;
    });

    function closeDropdown() {
      dropdownOpen.value = false;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!dropdownOpen.value) {
        return;
      }
      const target = event.target as Node;
      if (searchWrapperRef.value?.contains(target)) {
        return;
      }
      closeDropdown();
    }

    function toggleDropdown() {
      dropdownOpen.value = !dropdownOpen.value;
      if (dropdownOpen.value) {
        searchInputRef.value?.focus();
      }
    }

    function handleSuggestionSelect(item: {
      value: string;
      type: "tag" | "site";
    }) {
      const finalValue =
        item.type === "tag" ? `#${item.value}` : `site:${item.value}`;
      uiStore.applyQuickSearch(finalValue);
      closeDropdown();
    }

    function handleInput(event: InputEvent) {
      uiStore.applyQuickSearch((event.target as HTMLInputElement).value);
    }

    function handleReset() {
      uiStore.resetFilters();
      closeDropdown();
    }

    onMounted(() => {
      document.addEventListener("click", handleDocumentClick);
    });

    onBeforeUnmount(() => {
      document.removeEventListener("click", handleDocumentClick);
    });

    return () => (
      <nav class="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white/80 px-6 py-4 text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-white">
        <div class="text-lg font-semibold">MyZ 智能助理</div>
        <div class="flex flex-1 flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const active = activeKey.value === tab.key;
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
                aria-label={tab.key === "settings" ? "打开设置" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </RouterLink>
            );
          })}
        </div>
        {isHighlightsRoute.value ? (
          <div class="relative w-full max-w-md flex-1" ref={searchWrapperRef}>
            <div class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
              <input
                ref={searchInputRef}
                type="search"
                class="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="搜索/标签/网站"
                value={uiStore.quickSearch}
                onInput={handleInput}
                onFocus={() => {
                  inputFocused.value = true;
                }}
                onBlur={() => {
                  setTimeout(() => {
                    inputFocused.value = false;
                  }, 100);
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
              {uiStore.quickSearch ? (
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
        <div class="ml-auto flex items-center">
          <ThemeToggle variant="switch" aria-label="切换日夜模式" />
        </div>
      </nav>
    );
  },
});
