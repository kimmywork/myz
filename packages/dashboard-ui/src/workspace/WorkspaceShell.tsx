import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue"
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

export interface WorkspaceSlotProps {
  navOpen: boolean
  openNav: () => void
  closeNav: () => void
}

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
    /** Rendered above the scrolling main area (48px, §4.27). */
    panelOpen: { type: Boolean, default: false },
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
    const navOpen = ref(false)

    watch(navWidth, (value) => {
      writeStoredWidth(storage, NAV_WIDTH_STORAGE_KEY, value)
    })
    watch(panelWidth, (value) => {
      writeStoredWidth(storage, PANEL_WIDTH_STORAGE_KEY, value)
    })

    const hasPanel = computed(() => Boolean(props.panelOpen && slots.panel))
    const navCollapsed = computed(() => navWidth.value === 0)

    const style = computed(() => ({
      "--ws-nav-w": navCollapsed.value
        ? "0px"
        : `${Math.round(navWidth.value)}px`,
      "--ws-panel-w": `${Math.round(panelWidth.value)}px`,
    }))

    function openNav() {
      navOpen.value = true
    }

    function closeNav() {
      navOpen.value = false
    }

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && navOpen.value) {
        closeNav()
      }
    }

    onMounted(() => {
      window.addEventListener("keydown", onKeydown)
    })
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown)
    })

    return () => {
      const current: WorkspaceSlotProps = {
        navOpen: navOpen.value,
        openNav,
        closeNav,
      }
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
            class={["myz-workspace__nav", navOpen.value ? "is-open" : ""].join(
              " ",
            )}
            data-testid="workspace-nav"
            inert={navCollapsed.value && !navOpen.value ? true : undefined}
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
            <div class="myz-workspace__body">{slots.default?.(current)}</div>
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
              <aside class="myz-workspace__panel" data-testid="workspace-panel">
                {slots.panel?.()}
              </aside>
            </>
          ) : null}
          {slots.bottomNav ? (
            <div class="myz-workspace__bottom">{slots.bottomNav()}</div>
          ) : null}
          {navOpen.value ? (
            <div
              class="myz-workspace__backdrop"
              onClick={closeNav}
              aria-hidden="true"
            />
          ) : null}
        </div>
      )
    }
  },
})
