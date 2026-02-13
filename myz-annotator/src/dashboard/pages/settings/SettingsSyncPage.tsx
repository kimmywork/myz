import { defineComponent } from "vue"
import SyncSection from "../../components/settings/SyncSection.jsx"

export default defineComponent({
  name: "SettingsSyncPage",
  setup() {
    return () => <SyncSection />
  },
})
