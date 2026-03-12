import { ChatCompletionClient } from "./types"

export type Capability = (client: ChatCompletionClient) => ChatCompletionClient

export function composeCapabilities(
  base: ChatCompletionClient,
  capabilities: Capability[] = [],
): ChatCompletionClient {
  return capabilities.reduce((client, capability) => capability(client), base)
}
