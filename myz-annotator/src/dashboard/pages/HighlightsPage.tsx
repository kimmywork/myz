import { defineComponent } from "vue"
import FilterToolbar from "../components/FilterToolbar.jsx"
import HighlightsPane from "../components/HighlightsPane.jsx"

export default defineComponent({
  name: "HighlightsPage",
  setup() {
    return () => (
      <>
        <FilterToolbar />
        <HighlightsPane />
      </>
    )
  },
})
