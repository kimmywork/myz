export function parseTwitterProfileUrl(input: string): {
  username: string
  profileUrl: string
} {
  const trimmed = (input || "").trim()
  if (!trimmed) {
    throw new Error("请填写 Twitter/X 个人主页地址")
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error("Twitter/X 个人主页地址格式无效")
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error("Twitter/X 个人主页地址必须以 http(s) 开头")
  }

  const hostname = (url.hostname || "").toLowerCase()
  if (hostname !== "x.com" && hostname !== "twitter.com") {
    throw new Error("仅支持 x.com 或 twitter.com 的个人主页地址")
  }

  const username = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0]

  if (!username || !/^[A-Za-z0-9_]{1,30}$/.test(username)) {
    throw new Error("主页地址中的用户名不合法")
  }

  return {
    username,
    profileUrl: `https://x.com/${username}`,
  }
}

export function parseMastodonProfileUrl(input: string): {
  username: string
  instanceHost: string
  profileUrl: string
} {
  const trimmed = (input || "").trim()
  if (!trimmed) {
    throw new Error("请填写 Mastodon 个人主页地址")
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error("Mastodon 个人主页地址格式无效")
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error("Mastodon 个人主页地址必须以 http(s) 开头")
  }
  if (!url.hostname) {
    throw new Error("Mastodon 个人主页地址缺少域名")
  }

  const first = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0]
  if (!first || !first.startsWith("@")) {
    throw new Error(
      "Mastodon 个人主页地址应类似 https://mastodon.social/@username",
    )
  }

  const username = first.slice(1)
  if (!username) {
    throw new Error("无法从主页地址解析用户名")
  }

  return {
    username,
    instanceHost: url.hostname,
    profileUrl: `https://${url.hostname}/@${username}`,
  }
}
