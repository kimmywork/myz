import { AiAgentsPanel } from "@myz/dashboard-ai-settings";
import { defineComponent } from "vue";
import { useAiSettingsContext } from "./aiSettingsContext.js";

export default defineComponent({
  name: "AiAgentsPage",
  setup() {
    const context = useAiSettingsContext();

    return () => (
      <AiAgentsPanel
        providers={context.providers.value}
        agents={context.agents.value}
        saveNotice={context.agentSaveNotice.value}
        onChange={(next) => (context.agents.value = next)}
        onSave={context.saveAgentsSection}
      />
    );
  },
});
