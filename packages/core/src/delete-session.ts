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
  /** Cancels a persisted intent; `false` when it was already committed. */
  cancel: (ids: readonly string[]) => Promise<boolean>
  /** Puts the items back into the UI. */
  restore: (items: readonly T[]) => void
  onCommitted?: (ids: readonly string[]) => void
  onCommitFailed?: (items: readonly T[]) => void
  onUndone?: (items: readonly T[]) => void
  /** The intent was already committed (e.g. the alarm won); undo is too late. */
  onUndoUnavailable?: (items: readonly T[]) => void
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
  /**
   * Freezes one group's countdown (undo affordance hovered/focused) and
   * extends its durable intent so the background cannot commit meanwhile.
   * Without ids the newest group is paused.
   */
  pause: (ids?: readonly string[]) => void
  /** Resumes a paused countdown and re-arms the durable intent. */
  resume: (ids?: readonly string[]) => void
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
  /** Ids whose queue() call is still in flight (dedupe across a tick). */
  const queueing = new Set<string>()
  /** Commits already detached from `groups` but still running. */
  const commits = new Set<Promise<void>>()

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
      runCommit(group)
    }, delay)
  }

  /**
   * Starts a commit and keeps it tracked until it settles, so `flushAll()` can
   * wait for a timer-started commit that already left `groups`.
   */
  function runCommit(group: PendingGroup<T>): Promise<void> {
    const promise = commitGroup(group).finally(() => {
      commits.delete(promise)
    })
    commits.add(promise)
    return promise
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

  function groupFor(ids?: readonly string[]): PendingGroup<T> | undefined {
    return ids
      ? groups.find((candidate) => sameIds(candidate.ids, ids))
      : groups[groups.length - 1]
  }

  function pendingIdSet(): Set<string> {
    return new Set(groups.flatMap((group) => group.ids))
  }

  /** Extends the durable deadline so pause cannot be outrun by the alarm. */
  function extendIntent(group: PendingGroup<T>, delay: number) {
    void ports.queue(group.ids, now() + delay).catch(() => undefined)
  }

  async function schedule(
    items: readonly T[],
    options: { flushPrevious?: boolean } = {},
  ): Promise<boolean> {
    if (!items.length) return true
    // A record that is already pending must not get a second group (its
    // current undo affordance stays valid).
    const alreadyPending = pendingIdSet()
    const candidates = items.filter(
      (item) => !alreadyPending.has(ports.getId(item)),
    )
    if (!candidates.length) return true
    // One undo affordance at a time by default; content toasts keep one group
    // per record and pass `flushPrevious: false`.
    if (options.flushPrevious !== false) await flushAll()
    // Also dedupe against a queue() call that has not resolved yet.
    const fresh = candidates.filter(
      (item) => !queueing.has(ports.getId(item)),
    )
    if (!fresh.length) return true
    const ids = fresh.map(ports.getId)
    ids.forEach((id) => queueing.add(id))
    const dueAt = now() + windowMs
    let queued = false
    try {
      queued = await ports.queue(ids, dueAt)
    } catch {
      queued = false
    } finally {
      ids.forEach((id) => queueing.delete(id))
    }
    if (!queued) return false
    const group: PendingGroup<T> = {
      id: `delete-${nextGroupId++}`,
      ids,
      items: [...fresh],
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
    // A paused group has no timer; remember that so a failed cancel does not
    // restart a countdown the user had frozen.
    const wasRunning = group.timer !== null
    const remaining = wasRunning
      ? Math.max(0, group.remaining - (now() - group.startedAt))
      : group.remaining
    if (group.timer) {
      clearTimeout(group.timer)
      group.timer = null
    }
    let cancelled = false
    try {
      cancelled = await ports.cancel(group.ids)
    } catch {
      // Unknown outcome (message failed): keep the group retryable instead of
      // pretending the delete committed. Only re-arm a countdown that was
      // running before the undo attempt; a paused group stays paused so the
      // undo affordance cannot expire under the pointer.
      if (wasRunning) arm(group, remaining)
      return false
    }
    detach(group)
    if (!cancelled) {
      // The alarm/drain already committed it: do not pretend the rows are back.
      detach(group)
      ports.onUndoUnavailable?.(group.items)
      return false
    }
    ports.restore(group.items)
    ports.onUndone?.(group.items)
    return true
  }

  function pause(ids?: readonly string[]) {
    const group = groupFor(ids)
    if (!group?.timer) return
    clearTimeout(group.timer)
    group.timer = null
    group.remaining = Math.max(0, group.remaining - (now() - group.startedAt))
    extendIntent(group, group.remaining)
  }

  function resume(ids?: readonly string[]) {
    const group = groupFor(ids)
    if (!group || group.timer) return
    arm(group, group.remaining)
    extendIntent(group, group.remaining)
  }

  async function flushAll(): Promise<void> {
    const current = groups.slice()
    for (const group of current) {
      await runCommit(group)
    }
    // A timer may have fired before this call: wait for those too, otherwise a
    // caller that wipes storage right after (the reader list) races the commit.
    while (commits.size) {
      await Promise.all([...commits])
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
