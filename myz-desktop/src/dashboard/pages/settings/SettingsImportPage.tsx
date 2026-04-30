import { defineComponent } from "vue"
import ImportHighlightsSection from "../../components/settings/ImportHighlightsSection"

export default defineComponent({
  name: "SettingsImportPage",
  setup() {
    return () => <ImportHighlightsSection />
  },
})
