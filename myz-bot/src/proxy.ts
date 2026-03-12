import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici"

export function applyProxyFromEnv() {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  if (!proxy) return false
  setGlobalDispatcher(new EnvHttpProxyAgent())
  return true
}
