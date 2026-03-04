import { defineComponent } from "vue";
import SocialImportSection from "../../components/settings/SocialImportSection.jsx";

export default defineComponent({
  name: "SettingsSocialPage",
  setup() {
    return () => <SocialImportSection />;
  },
});
