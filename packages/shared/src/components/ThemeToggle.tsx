import { Monitor, Moon, Sun } from "@lucide/vue"
import { computed, defineComponent, ref, Teleport } from "vue"
import { useThemePreference } from "../theme"

const OPTIONS = [
  { value: "light", label: "亮色", Icon: Sun },
  { value: "dark", label: "暗色", Icon: Moon },
  { value: "auto", label: "跟随系统", Icon: Monitor },
] as const

type ThemeMode = (typeof OPTIONS)[number]["value"]

function getEffectiveOption(mode: string, effectiveTheme: string) {
  if (mode === "light") {
    return OPTIONS[0]
  }
  if (mode === "dark") {
    return OPTIONS[1]
  }
  return effectiveTheme === "light" ? OPTIONS[0] : OPTIONS[1]
}

export default defineComponent({
  name: "ThemeToggle",
  inheritAttrs: false,
  props: {
    size: {
      type: String,
      default: "md",
    },
    label: {
      type: String,
      default: "",
    },
    variant: {
      type: String,
      default: "pill", // pill | switch
    },
  },
  setup(props, { attrs }) {
    const { mode, effectiveTheme, setTheme, ready } = useThemePreference()
    const menuOpen = ref(false)
    const triggerRef = ref<HTMLElement | null>(null)

    const activeOption = computed(() =>
      getEffectiveOption(mode.value, effectiveTheme.value),
    )

    const dropdownPosition = computed(() => {
      if (!triggerRef.value) {
        return { top: 0, left: 0 }
      }
      const rect = triggerRef.value.getBoundingClientRect()
      return {
        top: rect.bottom + 8,
        left: rect.right - 144, // align right edge with button (w-36 = 144px)
      }
    })

    const sizeClass = computed(() =>
      props.size === "sm" ? "px-2.5 py-1 text-tag" : "px-3 py-1.5 text-caption",
    )

    function toggleMenu() {
      menuOpen.value = !menuOpen.value
    }

    function choose(option: (typeof OPTIONS)[number]) {
      setTheme(option.value as ThemeMode)
      menuOpen.value = false
    }

    return () => {
      const { class: className, ...restAttrs } = attrs
      const isSwitch = props.variant === "switch"
      const baseClass = isSwitch
        ? "inline-flex items-center rounded-pill border border-control-border bg-control-bg px-3 py-1.5 text-muted transition hover:border-accent hover:text-accent-text"
        : `inline-flex items-center gap-1.5 rounded-pill border border-control-border text-text transition hover:border-accent hover:text-accent-text ${sizeClass.value}`

      const Icon = activeOption.value.Icon
      const pos = dropdownPosition.value

      return (
        <span class="relative inline-flex">
          <button
            ref={triggerRef}
            type="button"
            {...restAttrs}
            class={[baseClass, className].filter(Boolean).join(" ")}
            aria-haspopup="listbox"
            aria-expanded={menuOpen.value}
            aria-label={props.label || "切换主题"}
            onClick={toggleMenu}
          >
            <span class="flex items-center gap-2">
              <span class="flex h-4 w-4 items-center justify-center">
                <Icon size={16} />
              </span>
              <span class="text-xs font-medium">
                {ready.value ? activeOption.value.label : "加载中…"}
              </span>
            </span>
          </button>
          {menuOpen.value ? (
            <Teleport to="body">
              <div
                role="listbox"
                class="fixed z-[9999] w-36 overflow-hidden rounded-panel border border-control-border bg-surface py-1 shadow-float"
                style={`top:${pos.top}px;left:${pos.left}px`}
              >
                {OPTIONS.map((option) => {
                  const OptionIcon = option.Icon
                  const isActive = option.value === mode.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => choose(option)}
                      class={[
                        "flex h-8 w-full items-center gap-2 rounded-tag px-2.5 text-left text-label transition",
                        isActive
                          ? "bg-surface-2 text-accent-text"
                          : "text-text hover:bg-surface-2",
                      ].join(" ")}
                    >
                      <span class="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2">
                        <OptionIcon size={14} />
                      </span>
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </Teleport>
          ) : null}
        </span>
      )
    }
  },
})
