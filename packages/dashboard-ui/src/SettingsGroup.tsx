import { defineComponent } from "vue"

/**
 * A settings section (§4.13).
 *
 * It carries **layout only**: the panel frame, the heading row, the field stack
 * and the action row. The classes mirror the `.settings__group*` family verbatim
 * so adopting it is a change of implementation, not of appearance — this
 * component is not the place to redesign the settings page.
 *
 * Slots: `default` (the fields), `actions` (the row in the heading; e.g. a
 * "reset" link), and `footer` (the trailing action bar with the top border).
 */
export default defineComponent({
  name: "SettingsGroup",
  props: {
    /** Section heading. */
    title: { type: String, default: "" },
    /** One line under the heading. */
    hint: { type: String, default: "" },
    /** Tighter field spacing (the old `settings__fields--compact`). */
    compact: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => (
      <section class="space-y-4 rounded-panel border border-line bg-surface p-5">
        {props.title || props.hint || slots.actions ? (
          <div class="flex items-center justify-between text-text">
            <div class="min-w-0">
              {props.title ? (
                <h3 class="text-title font-semibold text-text">{props.title}</h3>
              ) : null}
              {props.hint ? (
                <p class="text-caption text-muted">{props.hint}</p>
              ) : null}
            </div>
            {slots.actions ? (
              <div class="flex items-center gap-2 text-caption text-muted">
                {slots.actions()}
              </div>
            ) : null}
          </div>
        ) : null}

        <div class={props.compact ? "space-y-3" : "space-y-4"}>
          {slots.default?.()}
        </div>

        {slots.footer ? (
          <div class="flex flex-wrap gap-3 border-t border-line pt-3">
            {slots.footer()}
          </div>
        ) : null}
      </section>
    )
  },
})
