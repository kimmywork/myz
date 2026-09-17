import { computed, defineComponent } from "vue"

export default defineComponent({
  name: "DashboardAppShell",
  props: {
    theme: {
      type: String,
      default: "light",
    },
    outerWidthClass: {
      type: String,
      default: "mx-auto flex w-full max-w-[1400px] flex-col gap-6",
    },
    mainClass: {
      type: String,
      default: "flex min-h-0 flex-1 flex-col gap-6",
    },
  },
  setup(props, { slots }) {
    const shellClasses = computed(() => [
      "app-shell min-h-screen bg-bg text-text transition-colors",
    ])

    return () => (
      <div class={shellClasses.value.join(" ")}>
        <div class="mx-auto w-full px-4 py-8 sm:px-6 lg:px-10">
          <div class={props.outerWidthClass}>
            {slots.navbar?.()}
            <main class={props.mainClass}>{slots.default?.()}</main>
          </div>
        </div>
        {slots.modal?.()}
      </div>
    )
  },
})
