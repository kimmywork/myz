export interface InputHistoryController {
  isBrowsing: () => boolean
  remember: (value: string) => void
  reset: () => void
  move: (direction: -1 | 1, currentDraft: string) => string | null
}

export function createInputHistoryController(maxEntries: number): InputHistoryController {
  let entries: string[] = []
  let historyIndex = -1
  let draftBeforeHistory = ""

  const reset = () => {
    historyIndex = -1
    draftBeforeHistory = ""
  }

  return {
    isBrowsing() {
      return historyIndex >= 0
    },
    remember(value: string) {
      const normalized = value.trim()
      if (!normalized) return
      if (entries[entries.length - 1] !== normalized) {
        entries.push(normalized)
        if (entries.length > maxEntries) {
          entries = entries.slice(-maxEntries)
        }
      }
      reset()
    },
    reset,
    move(direction: -1 | 1, currentDraft: string) {
      if (!entries.length) return null
      if (direction < 0) {
        if (historyIndex < 0) {
          draftBeforeHistory = currentDraft
          historyIndex = entries.length - 1
          return entries[historyIndex] || ""
        }
        historyIndex = Math.max(0, historyIndex - 1)
        return entries[historyIndex] || ""
      }

      if (historyIndex < 0) {
        return null
      }

      if (historyIndex >= entries.length - 1) {
        historyIndex = -1
        const nextDraft = draftBeforeHistory
        draftBeforeHistory = ""
        return nextDraft
      }

      historyIndex = Math.min(entries.length - 1, historyIndex + 1)
      return entries[historyIndex] || ""
    },
  }
}
