import type { Slots } from "vue";
import { computed, defineComponent } from "vue";
import { useRoute } from "#imports";
import { NuxtLink } from "#components";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Login", href: "/login" },
  { label: "Register", href: "/register" },
];

export default defineComponent({
  name: "DefaultLayout",
  setup(_props, ctx) {
    const slots: Slots = ctx.slots;
    const route = useRoute();
    const currentPath = computed(() => route.path);
    const activeClass = "text-white";
    const inactiveClass = "text-white/70 hover:text-white transition";

    return () => (
      <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <header class="border-b border-white/10 bg-black/40 backdrop-blur">
          <nav class="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
            <div class="text-lg font-semibold tracking-wide text-white">MyZ Sync Service</div>
            <div class="flex items-center gap-4 text-sm">
              {NAV_LINKS.map((link) => (
                <NuxtLink
                  key={link.href}
                  to={link.href}
                  class={currentPath.value === link.href ? activeClass : inactiveClass}
                >
                  {link.label}
                </NuxtLink>
              ))}
            </div>
          </nav>
        </header>
        <main class="mx-auto w-full max-w-5xl px-6 py-10">{slots.default?.()}</main>
        <footer class="border-t border-white/10 bg-black/40 py-6 text-center text-xs text-white/50">
          &copy; {new Date().getFullYear()} MyZ Annotator Service
        </footer>
      </div>
    );
  },
});
