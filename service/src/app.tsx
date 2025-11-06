import "@/assets/styles/globals.css";
import { defineComponent } from "vue";
import { NuxtLayout, NuxtPage } from "#components";

const App = defineComponent({
  name: "MyZSyncApp",
  setup() {
    return () => (
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    );
  },
});

export default App;
