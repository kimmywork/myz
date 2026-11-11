import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue"
import type { PropType } from "vue"
import { createFocusTrap } from "@myz/shared/focusTrap"
import type { FocusTrap } from "@myz/shared/focusTrap"
import ResizeHandle from "./ResizeHandle.js"
import {
  NAV_WIDTH_DEFAULT,
  NAV_WIDTH_MAX,
  NAV_WIDTH_MIN,
  NAV_WIDTH_STORAGE_KEY,
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
  PANEL_WIDTH_STORAGE_KEY,
  browserWidthStorage,
  readStoredWidth,
  toggleCollapsed,
  writeStoredWidth,
} from "./width.js"
import "./workspace.css"

/**
 * The four-region workspace shell (§4.27): rail / nav / main / panel.
 *
 * Pages only put content into the regions; they never draw the shell. Header,
 * status bar, panel content and the bottom bar are optional slots. The nav and
 * panel widths are per-device preferences kept in local storage.
 */
export default defineComponent({
  name: "WorkspaceShell",
  props: {
    /** Narrow-screen nav drawer is controlled by the page that fills it. */
    navOpen: { type: Boolean, default: false },
    onCloseNav: Function as PropType<() => void>,
    /** Right detail panel (§4.27); below 1200 it becomes an overlay. */
    panelOpen: { type: Boolean, default: false },
    onClosePanel: Function as PropType<() => void>,
  },
  setup(props, { slots }) {
    const storage = browserWidthStorage()
    const navWidth = ref(
      readStoredWidth(
        storage,
        NAV_WIDTH_STORAGE_KEY,
        NAV_WIDTH_DEFAULT,
        NAV_WIDTH_MIN,
        NAV_WIDTH_MAX,
      ),
    )
    const panelWidth = ref(
      readStoredWidth(
        storage,
        PANEL_WIDTH_STORAGE_KEY,
        PANEL_WIDTH_DEFAULT,
        PANEL_WIDTH_MIN,
        PANEL_WIDTH_MAX,
      ),
    )

    watch(navWidth, (value) => {
      writeStoredWidth(storage, NAV_WIDTH_STORAGE_KEY, value)
    })
    watch(panelWidth, (value) => {
      writeStoredWidth(storage, PANEL_WIDTH_STORAGE_KEY, value)
    })

    const hasPanel = computed(() => Boolean(props.panelOpen && slots.panel))
    const panelRef = ref<HTMLElement | null>(null)
    const isNarrow = ref(false)
    let mediaQuery: MediaQueryList | null = null
    let panelTrap: FocusTrap | null = null

    function syncNarrow() {
      isNarrow.value = Boolean(mediaQuery?.matches)
    }

    function teardownPanelTrap() {
      panelTrap?.deactivate()
      panelTrap = null
    }

    // Below 1200 the panel is an overlay dialog: trap Tab inside it and
    // restore focus to the row on close (§4.8). The inline panel never
    // steals focus.
    async function setupPanelTrap() {
      if (!props.panelOpen || !isNarrow.value) {
        teardownPanelTrap()
        return
      }
      await nextTick()
      const el = panelRef.value
      if (!el) return
      teardownPanelTrap()
      panelTrap = createFocusTrap(el, {
        onEscape: () => props.onClosePanel?.(),
      })
      panelTrap.activate()
    }

    watch([() => props.panelOpen, isNarrow], () => {
      void setupPanelTrap()
    })
    const navCollapsed = computed(() => navWidth.value === 0)

    const style = computed(() => ({
      "--ws-nav-w": navCollapsed.value
        ? "0px"
        : `${Math.round(navWidth.value)}px`,
      "--ws-panel-w": `${Math.round(panelWidth.value)}px`,
    }))

    function onKeydown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (props.panelOpen) {
        props.onClosePanel?.()
        return
      }
      if (props.navOpen) {
        props.onCloseNav?.()
      }
    }

    onMounted(() => {
      window.addEventListener("keydown", onKeydown)
      if (typeof window.matchMedia === "function") {
        mediaQuery = window.matchMedia("(max-width: 1199px)")
        syncNarrow()
        mediaQuery.addEventListener("change", syncNarrow)
      }
    })
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown)
      mediaQuery?.removeEventListener("change", syncNarrow)
      teardownPanelTrap()
    })

    return () => {
      return (
        <div
          class={[
            "myz-workspace",
            hasPanel.value ? "is-panel-open" : "",
            navCollapsed.value ? "is-nav-collapsed" : "",
          ].join(" ")}
          style={style.value}
          data-testid="workspace-shell"
        >
          <div class="myz-workspace__rail-slot">{slots.rail?.()}</div>
          <div
            class={[
              "myz-workspace__nav",
              props.navOpen ? "is-open" : "",
            ].join(" ")}
            data-testid="workspace-nav"
            inert={navCollapsed.value && !props.navOpen ? true : undefined}
          >
            {slots.nav?.()}
          </div>
          <div class="myz-workspace__nav-handle">
            <ResizeHandle
              width={navWidth.value}
              min={NAV_WIDTH_MIN}
              max={NAV_WIDTH_MAX}
              defaultValue={NAV_WIDTH_DEFAULT}
              label="导航栏宽度"
              testId="workspace-nav-handle"
              onResize={(next: number) => {
                navWidth.value = next
              }}
              onReset={() => {
                navWidth.value = NAV_WIDTH_DEFAULT
              }}
              onToggleCollapse={() => {
                navWidth.value = toggleCollapsed(
                  navWidth.value,
                  NAV_WIDTH_DEFAULT,
                )
              }}
            />
          </div>
          <main class="myz-workspace__main">
            {slots.header ? (
              <div class="myz-workspace__header">{slots.header()}</div>
            ) : null}
            <div class="myz-workspace__body">{slots.default?.()}</div>
            {slots.statusbar ? (
              <div class="myz-workspace__statusbar">{slots.statusbar()}</div>
            ) : null}
          </main>
          {hasPanel.value ? (
            <>
              <div class="myz-workspace__panel-handle">
                <ResizeHandle
                  width={panelWidth.value}
                  min={PANEL_WIDTH_MIN}
                  max={PANEL_WIDTH_MAX}
                  defaultValue={PANEL_WIDTH_DEFAULT}
                  label="右栏宽度"
                  invert
                  testId="workspace-panel-handle"
                  onResize={(next: number) => {
                    panelWidth.value = next
                  }}
                  onReset={() => {
                    panelWidth.value = PANEL_WIDTH_DEFAULT
                  }}
                  onToggleCollapse={() => {
                    panelWidth.value = toggleCollapsed(
                      panelWidth.value,
                      PANEL_WIDTH_DEFAULT,
                    )
                  }}
                />
              </div>
              <aside
                ref={panelRef}
                class="myz-workspace__panel"
                data-testid="workspace-panel"
                role={isNarrow && props.panelOpen ? "dialog" : "complementary"}
                aria-modal={
                  isNarrow && props.panelOpen ? "true" : undefined
                }
                aria-label="详情"
                tabindex={-1}
              >
                {slots.panel?.()}
              </aside>
              <div
                class="myz-workspace__panel-backdrop"
                onClick={() => props.onClosePanel?.()}
                aria-hidden="true"
              />
            </>
          ) : null}
          {slots.bottomNav ? (
            <div class="myz-workspace__bottom">{slots.bottomNav()}</div>
          ) : null}
          {props.navOpen ? (
            <div
              class="myz-workspace__backdrop"
              onClick={() => props.onCloseNav?.()}
              aria-hidden="true"
            />
          ) : null}
        </div>
      )
    }
  },
})
