import { defineComponent } from "vue";

export default defineComponent({
  name: "PlaceholderPage",
  props: {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <section class="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-xl dark:border-white/10 dark:bg-slate-900/60">
        <div class="max-w-2xl space-y-3">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
            Desktop migration in progress
          </p>
          <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
            {props.title}
          </h2>
          <p class="text-sm leading-6 text-slate-500 dark:text-slate-400">
            {props.description}
          </p>
        </div>
      </section>
    );
  },
});
