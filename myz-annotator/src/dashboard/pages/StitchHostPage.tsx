import { defineComponent } from "vue";
import DashboardWorkspaceLayout from "../components/DashboardWorkspaceLayout.jsx";

/**
 * Workspace host for the stitch editor (2026-11-23): the editor page itself
 * runs unchanged in a same-origin iframe (same pattern as `/read`), so 拼图
 * lives on the rail and stays in the one workspace tab. Its capture-cache
 * picker (「缓存区」) reads the same staged assets the 素材 page shows.
 */
export default defineComponent({
  name: "StitchHostPage",
  setup() {
    return () => (
      <DashboardWorkspaceLayout>
        {{
          default: () => (
            <div class="relative h-full w-full">
              <iframe
                data-testid="stitch-frame"
                class="absolute inset-0 h-full w-full border-0"
                title="图片合成"
                src={chrome.runtime.getURL("src/stitch/stitch.html")}
              />
            </div>
          ),
        }}
      </DashboardWorkspaceLayout>
    );
  },
});
