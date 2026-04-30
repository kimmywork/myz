import { defineComponent } from "vue"
import SocialImportSection from "../../components/settings/SocialImportSection"

export default defineComponent({
  name: "SettingsSocialPage",
  setup() {
    return () => <SocialImportSection />
  },
})
