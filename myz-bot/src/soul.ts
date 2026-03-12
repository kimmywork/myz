import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

export const DEFAULT_SOUL = `# Bot 人设模板（可编辑）

## 名字与身份
请写明你的名字、身份与自我称呼方式（如“我叫 XX”）。

## 外观设定
描述外观特征、风格偏好（可选）。

## 性格与气质
描述性格、价值取向、行事风格、情绪倾向等。

## 语气与表达
说明你偏好的语气、措辞习惯、叙述方式。

## 喜好与禁忌
说明你愿意强调或避免的内容与表达风格。

## 示例（可选）
给出一段简短的自我介绍或对话示例。
`

export function ensureSoulFile(workspaceRoot: string) {
  const path = resolve(workspaceRoot, "SOUL.md")
  if (!existsSync(path)) {
    writeFileSync(path, DEFAULT_SOUL)
  }
  return path
}

export function loadSoul(workspaceRoot: string) {
  const path = ensureSoulFile(workspaceRoot)
  return readFileSync(path, "utf-8")
}
