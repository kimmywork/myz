import { registerMessageHandler } from "./handler.js"
import {
  deleteSkill,
  importSkill,
  listSkillFiles,
  listSkills,
  updateSkillEnabled,
  updateSkillFile,
} from "../ai/skills/storage.js"
import type { SkillImportPayload } from "../ai/skills/types.js"

export function initializeSkillMessageHandlers() {
  registerMessageHandler("myz:listSkills", async () => {
    return listSkills()
  })

  registerMessageHandler(
    "myz:getSkillDetail",
    async (payload: { skillId?: string }) => {
      const skillId = typeof payload?.skillId === "string" ? payload.skillId.trim() : ""
      if (!skillId) {
        throw new Error("skillId is required")
      }
      const skills = await listSkills()
      const skill = skills.find((item) => item.id === skillId) || null
      if (!skill) {
        throw new Error("Skill not found")
      }
      const files = await listSkillFiles(skillId)
      return { skill, files }
    },
  )

  registerMessageHandler(
    "myz:importSkills",
    async (payload: { skills?: SkillImportPayload[] }) => {
      const requests = Array.isArray(payload?.skills) ? payload.skills : []
      if (!requests.length) {
        throw new Error("skills payload is required")
      }

      const imported: any[] = []
      const errors: Array<{ rootDir?: string; message: string }> = []

      for (const request of requests) {
        try {
          const result = await importSkill(request)
          imported.push(result.skill)
        } catch (error) {
          errors.push({
            rootDir: request?.rootDir,
            message: String((error as Error)?.message || error || "导入失败"),
          })
        }
      }

      return { imported, errors }
    },
  )

  registerMessageHandler(
    "myz:updateSkillEnabled",
    async (payload: { skillId?: string; enabled?: boolean }) => {
      const skillId = typeof payload?.skillId === "string" ? payload.skillId.trim() : ""
      if (!skillId) {
        throw new Error("skillId is required")
      }
      return updateSkillEnabled(skillId, Boolean(payload?.enabled))
    },
  )

  registerMessageHandler(
    "myz:deleteSkill",
    async (payload: { skillId?: string }) => {
      const skillId = typeof payload?.skillId === "string" ? payload.skillId.trim() : ""
      if (!skillId) {
        throw new Error("skillId is required")
      }
      await deleteSkill(skillId)
      return { ok: true }
    },
  )

  registerMessageHandler(
    "myz:updateSkillFile",
    async (payload: {
      skillId?: string
      path?: string
      content?: string
      encoding?: "utf-8" | "base64"
    }) => {
      const skillId = typeof payload?.skillId === "string" ? payload.skillId.trim() : ""
      const path = typeof payload?.path === "string" ? payload.path.trim() : ""
      const content = typeof payload?.content === "string" ? payload.content : ""
      const encoding = payload?.encoding === "base64" ? "base64" : "utf-8"
      if (!skillId || !path) {
        throw new Error("skillId and path are required")
      }
      await updateSkillFile(skillId, path, content, encoding)
      return { ok: true }
    },
  )
}
