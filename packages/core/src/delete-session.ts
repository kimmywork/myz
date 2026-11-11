/**
 * Undoable delete session (design system §4.30).
 *
 * A delete is "scheduled" as one group: the host first persists a durable
 * intent through the `queue` port, then removes the rows from the UI and shows
 * the undo affordance. When the window ends the group is committed through the
 * `commit` port. Undo cancels the intent and restores the UI — storage was
 * never touched.
 *
 * The four host boundaries this model must survive:
 * 1. host teardown (page close, tab switch, unmount) → `dispose()` commits,
 *    never drops; the durable intent also lets the background finish it.
 * 2. route change → `flushAll()` commits.
 * 3. commit failure → the group is restored and reported.
 * 4. batch delete → one `commit` call for the whole group (all or nothing).
 *
 * No DOM, Vue, chrome or timers beyond `setTimeout`; the host injects ports.
 */

/** How long the undo affordance stays actionable (§4.15 / §4.30). */
export const DELETE_UNDO_WINDOW_MS = 6000

/** Host ports for one delete session. */
export interface DeleteSessionPorts<T> {
  /** Stable id used for the intent journal and the commit call. */
  getId: (item: T) => string
  /** Persists the durable intent before the UI removes the rows. */
  queue: (ids: readonly string[], dueAt: number) => Promise<boolean>
  /** Deletes the records. Resolves `false` when nothing was deleted. */
  commit: (ids: readonly string[]) => Promise<boolean>
  /** Cancels a persisted intent (undo or failed commit). */
  cancel: (ids: readonly string[]) => Promise<void>
  /** Puts the items back into the UI. */
  restore: (items: readonly T[]) => void
  onCommitted?: (ids: readonly string[]) => void
  onCommitFailed?: (items: readonly T[]) => void
  onUndone?: (items: readonly T[]) => void
  /** Clock override for tests. */
  now?: () => number
  windowMs?: number
}

/** The controller returned by {@link createDeleteSession}. */
export interface DeleteSession<T> {
  /**
   * Queues one group and arms its countdown. Resolves `false` when the intent
   * could not be persisted (the caller must keep the rows visible).
   */
  schedule: (
    items: readonly T[],
    options?: { flushPrevious?: boolean },
  ) => Promise<boolean>
  /**
   * Cancels a pending group and restores it. Without ids the newest group is
   * undone; with ids the group carrying exactly those ids is undone (content
   * toasts keep one group per record).
   */
  undo: (ids?: readonly string[]) => Promise<boolean>
  /** Freezes the newest countdown (undo affordance hovered/focused). */
  pause: () => void
  /** Resumes a paused countdown. */
  resume: () => void
  /** Commits every pending group now (route change, explicit flush). */
  flushAll: () => Promise<void>
  /** Ids of every pending group. */
  pendingIds: () => string[]
  /**
   * Host teardown: commits everything and never drops a pending delete.
   * Fire-and-forget because unload cannot await; the durable intent covers
   * the write if the page dies first.
   */
  dispose: () => void
}

interface PendingGroup<T> {
  id: string
  ids: string[]
  items: T[]
  timer: ReturnType<typeof setTimeout> | null
  /** Milliseconds left before commit while paused. */
  remaining: number
  /** When the running countdown started. */
  startedAt: number
  committing: boolean
}

let nextGroupId = 0

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((id, index) => id === sortedRight[index])
}

/**
 * Creates one delete session.
 *
 * @param ports Host callbacks for intent persistence, commit, cancel and UI
 *   restore.
 * @returns The session controller.
 */
export function createDeleteSession<T>(
  ports: DeleteSessionPorts<T>,
): DeleteSession<T> {
  const windowMs = ports.windowMs ?? DELETE_UNDO_WINDOW_MS
  const now = ports.now ?? (() => Date.now())
  const groups: PendingGroup<T>[] = []

  function detach(group: PendingGroup<T>) {
    if (group.timer) {
      clearTimeout(group.timer)
      group.timer = null
    }
    const index = groups.indexOf(group)
    if (index >= 0) groups.splice(index, 1)
  }

  function arm(group: PendingGroup<T>, delay: number) {
    group.startedAt = now()
    group.remaining = delay
    group.timer = setTimeout(() => {
      group.timer = null
      void commitGroup(group)
    }, delay)
  }

  async function commitGroup(group: PendingGroup<T>) {
    if (group.committing) return
    group.committing = true
    detach(group)
    let committed = false
    try {
      committed = await ports.commit(group.ids)
    } catch {
      committed = false
    }
    if (committed) {
      ports.onCommitted?.(group.ids)
      return
    }
    // Nothing was deleted: drop the durable intent so a background drain does
    // not retry behind the user's back, then put the rows back.
    try {
      await ports.cancel(group.ids)
    } catch {
      /* The commit already failed; restore regardless. */
    }
    ports.restore(group.items)
    ports.onCommitFailed?.(group.items)
  }

  async function schedule(
    items: readonly T[],
    options: { flushPrevious?: boolean } = {},
  ): Promise<boolean> {
    if (!items.length) return true
    // One undo affordance at a time by default; content toasts keep one group
    // per record and pass `flushPrevious: false`.
    if (options.flushPrevious !== false) await flushAll()
    const ids = items.map(ports.getId)
    const dueAt = now() + windowMs
    let queued = false
    try {
      queued = await ports.queue(ids, dueAt)
    } catch {
      queued = false
    }
    if (!queued) return false
    const group: PendingGroup<T> = {
      id: `delete-${nextGroupId++}`,
      ids,
      items: [...items],
      timer: null,
      remaining: windowMs,
      startedAt: 0,
      committing: false,
    }
    groups.push(group)
    arm(group, windowMs)
    return true
  }

  async function undo(ids?: readonly string[]): Promise<boolean> {
    const group = ids
      ? groups.find((candidate) => sameIds(candidate.ids, ids))
      : groups[groups.length - 1]
    if (!group) return false
    detach(group)
    try {
      await ports.cancel(group.ids)
    } catch {
      // The intent is still durable; let it commit rather than claim an undo.
      void commitGroup(group)
      return false
    }
    ports.restore(group.items)
    ports.onUndone?.(group.items)
    return true
  }

  function pause() {
    const group = groups[groups.length - 1]
    if (!group?.timer) return
    clearTimeout(group.timer)
    group.timer = null
    group.remaining = Math.max(0, group.remaining - (now() - group.startedAt))
  }

  function resume() {
    const group = groups[groups.length - 1]
    if (!group || group.timer) return
    arm(group, group.remaining)
  }

  async function flushAll(): Promise<void> {
    const current = groups.slice()
    for (const group of current) {
      await commitGroup(group)
    }
  }

  return {
    schedule,
    undo,
    pause,
    resume,
    flushAll,
    pendingIds: () => groups.flatMap((group) => group.ids),
    dispose: () => {
      // Never drop a pending delete: teardown means "user accepted it".
      void flushAll()
    },
  }
}
