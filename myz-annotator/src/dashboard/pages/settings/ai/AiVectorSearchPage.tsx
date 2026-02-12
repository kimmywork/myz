import { defineComponent } from "vue"
import AiVectorSearchSection from "../../../components/ai-settings/AiVectorSearchSection.jsx"
import { useAiSettingsContext } from "./aiSettingsContext.js"

export default defineComponent({
  name: "AiVectorSearchPage",
  setup() {
    const context = useAiSettingsContext()

    return () => (
      <div class="space-y-4">
        <AiVectorSearchSection providers={context.providers.value} />
      </div>
    )
  },
})
