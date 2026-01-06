import { computed, defineComponent, ref, watch } from "vue"
import { useSettingsStore } from "../stores/settings.js"
import type {
  AIAgentsSettings,
  AIModelSetting,
  AIProviderSetting,
  McpServerSetting,
} from "@/background/settings.js"
import { sendMessage } from "@/shared/messaging.js"
import AiProviderList from "./ai-settings/AiProviderList.jsx"
import AiProviderEditor from "./ai-settings/AiProviderEditor.jsx"
import AiAgentRouting from "./ai-settings/AiAgentRouting.jsx"
import AiMcpServersEditor from "./ai-settings/AiMcpServersEditor.jsx"
import { createProviderSetting, createModelSetting } from "./ai-settings/factories.js"

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function ensureProviderHasModel(provider: AIProviderSetting) {
  if (provider.models?.length) return provider
  return { ...provider, models: [createModelSetting("")] }
}

function clearMissingTargets(
  agents: AIAgentsSettings,
  providers: AIProviderSetting[],
): AIAgentsSettings {
  const providerById = new Map(providers.map((p) => [p.id, p]))

  const normalize = (key: "conversation" | "insights") => {
    const agent = agents[key]
    if (!agent?.target) return agent
    const provider = providerById.get(agent.target.providerId)
    if (!provider?.enabled || !provider.lastTest?.ok) {
      return { ...agent, target: null }
    }
    const model = (provider.models || []).find((m) => m.id === agent.target?.modelId)
    if (!model?.enabled) {
      return { ...agent, target: null }
    }
    return agent
  }

  return {
    conversation: normalize("conversation"),
    insights: normalize("insights"),
  }
}

export default defineComponent({
  name: "AiSettings",
  setup() {
    const store = useSettingsStore()
    const aiAssistantEnabled = ref(false)
    const providers = ref<AIProviderSetting[]>([])
    const agents = ref<AIAgentsSettings>({
      conversation: { target: null, temperature: 0.7 },
      insights: { target: null, temperature: 0.7 },
    })
    const mcpServers = ref<McpServerSetting[]>([])

    const selectedProviderId = ref<string | null>(null)
    const isFetchingModels = ref(false)
    const isTesting = ref(false)
    const statusMessage = ref("")
    const catalogByProviderId = ref<Record<string, string[]>>({})

    const usedByMap = computed(() => {
      const map: Record<string, string[]> = {}
      const targets = [
        { key: "Conversation", target: agents.value.conversation?.target },
        { key: "Insights", target: agents.value.insights?.target },
      ]
      targets.forEach(({ key, target }) => {
        if (!target?.providerId) return
        map[target.providerId] = map[target.providerId] || []
        map[target.providerId].push(key)
      })
      return map
    })

    const selectedProvider = computed(
      () => providers.value.find((p) => p.id === selectedProviderId.value) || null,
    )

    const selectedCatalog = computed(() => {
      const id = selectedProviderId.value
      if (!id) return []
      return catalogByProviderId.value[id] || []
    })

    const setFormFromStore = () => {
      aiAssistantEnabled.value = Boolean(store.settings.aiAssistantEnabled)
      providers.value = (store.settings.aiProviders || []).map((p) =>
        ensureProviderHasModel(deepClone(p)),
      )
      if (providers.value.length === 0) {
        const created = ensureProviderHasModel(createProviderSetting())
        providers.value = [created]
        selectedProviderId.value = created.id
      }
      agents.value = deepClone(store.settings.aiAgents)
      mcpServers.value = (store.settings.aiMcpServers || []).map((s) => ({ ...s }))

      if (!selectedProviderId.value || !providers.value.some((p) => p.id === selectedProviderId.value)) {
        selectedProviderId.value = providers.value[0]?.id || null
      }
    }

    watch(
      () => store.settings,
      () => setFormFromStore(),
      { deep: true, immediate: true },
    )

    const replaceProvider = (next: AIProviderSetting) => {
      providers.value = providers.value.map((p) => (p.id === next.id ? next : p))
    }

    const addProvider = () => {
      const created = ensureProviderHasModel(createProviderSetting())
      providers.value = [...providers.value, created]
      selectedProviderId.value = created.id
      statusMessage.value = ""
    }

    const removeProvider = (id: string) => {
      providers.value = providers.value.filter((p) => p.id !== id)
      agents.value = {
        conversation:
          agents.value.conversation.target?.providerId === id
            ? { ...agents.value.conversation, target: null }
            : agents.value.conversation,
        insights:
          agents.value.insights.target?.providerId === id
            ? { ...agents.value.insights, target: null }
            : agents.value.insights,
      }
      if (selectedProviderId.value === id) {
        selectedProviderId.value = providers.value[0]?.id || null
      }
    }

    const fetchModels = async () => {
      const provider = selectedProvider.value
      if (!provider) return
      statusMessage.value = ""
      isFetchingModels.value = true
      try {
        const result = await sendMessage("myz:aiProviderFetchModels", {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          headers: provider.headers || "",
        })
        const models = Array.isArray(result?.models) ? result.models : []
        catalogByProviderId.value = {
          ...catalogByProviderId.value,
          [provider.id]: models,
        }
        statusMessage.value = models.length ? `已加载 ${models.length} 个模型` : "未返回模型"
      } catch (error) {
        statusMessage.value = `加载失败：${(error as Error).message}`
      } finally {
        isFetchingModels.value = false
      }
    }

    const testConnection = async (model: AIModelSetting) => {
      const provider = selectedProvider.value
      if (!provider) return

      isTesting.value = true
      statusMessage.value = ""
      try {
        const result = await sendMessage("myz:aiProviderTestConnection", {
          provider: {
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            headers: provider.headers || "",
          },
          model: model.model,
          maxOutputTokens: model.limits?.maxOutputTokens,
          maxOutputTokenParam: model.limits?.maxOutputTokenParam,
        })
        const ok = Boolean(result?.success)
        const message = ok ? result?.response || "连接成功" : result?.error || "连接失败"
        const testedAt = new Date().toISOString()

        const next: AIProviderSetting = {
          ...provider,
          enabled: ok ? provider.enabled : false,
          lastTest: { ok, message, testedAt, model: model.model },
        }
        replaceProvider(next)
      } catch (error) {
        const message = (error as Error).message
        const testedAt = new Date().toISOString()
        const next: AIProviderSetting = {
          ...provider,
          enabled: false,
          lastTest: { ok: false, message, testedAt, model: model.model },
        }
        replaceProvider(next)
      } finally {
        isTesting.value = false
      }
    }

    const saveAll = async () => {
      const nextProviders = providers.value.map((p) => {
        if (!p.lastTest?.ok && p.enabled) {
          return { ...p, enabled: false }
        }
        return p
      })
      const nextAgents = clearMissingTargets(agents.value, nextProviders)
      await store.saveSettings({
        aiAssistantEnabled: Boolean(aiAssistantEnabled.value),
        aiProviders: nextProviders,
        aiAgents: nextAgents,
        aiMcpServers: mcpServers.value,
      })
      providers.value = nextProviders
      agents.value = nextAgents
    }

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>AI Assistant</h3>
          <label class="toggle">
            <input
              type="checkbox"
              checked={aiAssistantEnabled.value}
              onChange={(e) => (aiAssistantEnabled.value = (e.target as HTMLInputElement).checked)}
            />
            <span>启用智能助理</span>
          </label>
        </div>

        <div class="settings__fields space-y-4">
          <p class="settings__hint">
            支持添加多个 OpenAI Compatible Provider。Provider 需测试通过后才能启用；模型可分别配置能力与 token 参数。
          </p>

          <div class="grid gap-4 md:grid-cols-3">
            <AiProviderList
              providers={providers.value}
              selectedProviderId={selectedProviderId.value}
              usedByMap={usedByMap.value}
              onSelect={(id) => (selectedProviderId.value = id)}
              onAdd={addProvider}
              onRemove={removeProvider}
            />

            <div class="md:col-span-2 space-y-3">
              {selectedProvider.value ? (
                <AiProviderEditor
                  provider={selectedProvider.value}
                  catalog={selectedCatalog.value}
                  isFetchingModels={isFetchingModels.value}
                  isTesting={isTesting.value}
                  statusMessage={statusMessage.value}
                  onChange={replaceProvider}
                  onFetchModels={fetchModels}
                  onTestConnection={testConnection}
                />
              ) : (
                <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
                  <p class="text-sm text-slate-500">请选择或添加 Provider</p>
                </div>
              )}
            </div>
          </div>

          <AiAgentRouting
            providers={providers.value}
            agents={agents.value}
            onChange={(next) => (agents.value = next)}
          />

          <AiMcpServersEditor
            servers={mcpServers.value}
            onChange={(next) => (mcpServers.value = next)}
          />

          <div class="flex justify-end">
            <button type="button" class="btn btn-primary" onClick={saveAll}>
              保存 AI 设置
            </button>
          </div>
        </div>
      </section>
    )
  },
})
