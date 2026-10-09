import { defineComponent } from "vue";
import SetupWizard from "../components/setup/SetupWizard.jsx";

export default defineComponent({
  name: "SetupPage",
  setup() {
    return () => <SetupWizard />;
  },
});
