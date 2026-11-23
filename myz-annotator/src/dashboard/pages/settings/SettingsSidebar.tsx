import { defineComponent } from "vue";
import {
  SETTINGS_SECTION_GROUPS,
  type SettingsSectionKey,
} from "./settings-sections.js";

/**
 * Group nav for the settings modal (§4.17 侧栏规格): uppercase group titles,
 * 36px items, current item on `--myz-surface-2` + accent text. State-driven —
 * the modal owns the active section, so no routing is involved.
 */
export default defineComponent({
  name: "SettingsSidebar",
  props: {
    active: { type: String, required: true },
    onSelect: { type: Function, required: true },
  },
  setup(props) {
    return () => (
      <aside aria-label="设置分组">
        <div class="space-y-4">
          {SETTINGS_SECTION_GROUPS.map((group) => (
            <div key={group.title} class="space-y-2">
              <div class="text-tag font-semibold uppercase tracking-wide text-muted">
                {group.title}
              </div>
              <div class="space-y-1">
                {group.items.map((item) => {
                  const active = props.active === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      class={[
                        "flex w-full items-center justify-between rounded-control px-3 py-2 text-compact font-medium transition",
                        active
                          ? "bg-surface-2 text-accent-text"
                          : "text-muted hover:bg-surface-2",
                      ].join(" ")}
                      aria-current={active ? "page" : undefined}
                      data-testid={`settings-nav-${item.key}`}
                      onClick={() =>
                        (props.onSelect as (key: SettingsSectionKey) => void)(
                          item.key,
                        )
                      }
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
  },
});
