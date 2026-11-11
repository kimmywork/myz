import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DELETE_UNDO_WINDOW_MS,
  createDeleteSession,
} from "../src/delete-session"

interface Item {
  id: string
}

function setup(overrides: Record<string, unknown> = {}) {
  const ports = {
    getId: (item: Item) => item.id,
    queue: vi.fn(async () => true),
    commit: vi.fn(async () => true),
    cancel: vi.fn(async () => true),
    restore: vi.fn(),
    onCommitted: vi.fn(),
    onCommitFailed: vi.fn(),
    onUndone: vi.fn(),
    onUndoUnavailable: vi.fn(),
    ...overrides,
  }
  const session = createDeleteSession<Item>(ports)
  return { ports, session }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe("createDeleteSession", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("persists the intent first, then commits when the window ends", async () => {
    const { ports, session } = setup()
    const items = [{ id: "a" }, { id: "b" }]

    expect(await session.schedule(items)).toBe(true)
    expect(ports.queue).toHaveBeenCalledTimes(1)
    expect(ports.queue.mock.calls[0][0]).toEqual(["a", "b"])
    expect(ports.queue.mock.calls[0][1]).toBe(
      Date.now() + DELETE_UNDO_WINDOW_MS,
    )
    expect(ports.commit).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).toHaveBeenCalledTimes(1)
    expect(ports.commit.mock.calls[0][0]).toEqual(["a", "b"])
    expect(ports.onCommitted).toHaveBeenCalledWith(["a", "b"])
    expect(session.pendingIds()).toEqual([])
  })

  it("commits on host teardown instead of dropping the delete", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }])

    session.dispose()
    await flushPromises()

    expect(ports.commit).toHaveBeenCalledWith(["a"])
    expect(ports.restore).not.toHaveBeenCalled()
  })

  it("commits on route change via flushAll", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }])

    await session.flushAll()
    expect(ports.commit).toHaveBeenCalledWith(["a"])
    expect(session.pendingIds()).toEqual([])
  })

  it("restores the rows and cancels the intent when the commit fails", async () => {
    const { ports, session } = setup({
      commit: vi.fn(async () => false),
    })
    const items = [{ id: "a" }, { id: "b" }]
    await session.schedule(items)

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)

    expect(ports.restore).toHaveBeenCalledWith(items)
    expect(ports.onCommitFailed).toHaveBeenCalledWith(items)
    expect(ports.cancel).toHaveBeenCalledWith(["a", "b"])
  })

  it("treats a throwing commit as a failure", async () => {
    const { ports, session } = setup({
      commit: vi.fn(async () => {
        throw new Error("offline")
      }),
    })
    await session.schedule([{ id: "a" }])

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.restore).toHaveBeenCalled()
    expect(ports.onCommitFailed).toHaveBeenCalled()
  })

  it("deletes a batch with one commit call and restores all on failure", async () => {
    const { ports, session } = setup({
      commit: vi.fn(async () => false),
    })
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }]
    await session.schedule(items)

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)

    expect(ports.commit).toHaveBeenCalledTimes(1)
    expect(ports.commit.mock.calls[0][0]).toEqual(["a", "b", "c"])
    expect(ports.restore).toHaveBeenCalledWith(items)
  })

  it("undo cancels the intent, restores the rows and never commits", async () => {
    const { ports, session } = setup()
    const items = [{ id: "a" }]
    await session.schedule(items)

    expect(await session.undo()).toBe(true)
    expect(ports.cancel).toHaveBeenCalledWith(["a"])
    expect(ports.restore).toHaveBeenCalledWith(items)
    expect(ports.onUndone).toHaveBeenCalledWith(items)

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).not.toHaveBeenCalled()
  })

  it("keeps the rows visible when the intent cannot be persisted", async () => {
    const { ports, session } = setup({
      queue: vi.fn(async () => false),
    })

    expect(await session.schedule([{ id: "a" }])).toBe(false)
    expect(ports.restore).not.toHaveBeenCalled()
    expect(ports.commit).not.toHaveBeenCalled()
    expect(session.pendingIds()).toEqual([])
  })

  it("pauses and resumes the countdown", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }])

    await vi.advanceTimersByTimeAsync(2000)
    session.pause()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ports.commit).not.toHaveBeenCalled()

    session.resume()
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS - 2000)
    expect(ports.commit).toHaveBeenCalledTimes(1)
  })

  it("flushes an earlier group before showing a new undo affordance", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }])
    await session.schedule([{ id: "b" }])

    expect(ports.commit).toHaveBeenCalledWith(["a"])
    expect(ports.commit).toHaveBeenCalledTimes(1)
    expect(session.pendingIds()).toEqual(["b"])
  })

  it("keeps several groups when flushPrevious is false and undoes by id", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }], { flushPrevious: false })
    await session.schedule([{ id: "b" }], { flushPrevious: false })

    expect(ports.commit).not.toHaveBeenCalled()
    expect(session.pendingIds().sort()).toEqual(["a", "b"])

    expect(await session.undo(["a"])).toBe(true)
    expect(ports.restore).toHaveBeenCalledWith([{ id: "a" }])
    expect(session.pendingIds()).toEqual(["b"])

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).toHaveBeenCalledTimes(1)
    expect(ports.commit).toHaveBeenCalledWith(["b"])
  })

  it("returns false when undoing an unknown id set", async () => {
    const { session } = setup()
    await session.schedule([{ id: "a" }])
    expect(await session.undo(["missing"])).toBe(false)
  })

  it("does not restore when the intent was already committed", async () => {
    const { ports, session } = setup({
      cancel: vi.fn(async () => false),
    })
    await session.schedule([{ id: "a" }])

    expect(await session.undo()).toBe(false)
    expect(ports.restore).not.toHaveBeenCalled()
    expect(ports.onUndoUnavailable).toHaveBeenCalledWith([{ id: "a" }])
  })

  it("keeps a group retryable when the cancel call throws", async () => {
    const { ports, session } = setup({
      cancel: vi.fn(async () => {
        throw new Error("offline")
      }),
    })
    await session.schedule([{ id: "a" }])

    expect(await session.undo()).toBe(false)
    expect(ports.restore).not.toHaveBeenCalled()
    // The outcome is unknown, so the group stays pending and can be undone
    // again or committed later.
    expect(session.pendingIds()).toEqual(["a"])
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).toHaveBeenCalledWith(["a"])
  })

  it("keeps a paused group paused when the cancel call throws", async () => {
    const { ports, session } = setup({
      cancel: vi.fn(async () => {
        throw new Error("offline")
      }),
    })
    await session.schedule([{ id: "a" }])
    await vi.advanceTimersByTimeAsync(2_000)
    session.pause()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ports.commit).not.toHaveBeenCalled()

    expect(await session.undo()).toBe(false)
    expect(ports.restore).not.toHaveBeenCalled()
    expect(session.pendingIds()).toEqual(["a"])

    // The undo attempt must not restart the frozen countdown.
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).not.toHaveBeenCalled()

    // Resuming later still commits after the time that was left when paused.
    session.resume()
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS - 2_000)
    expect(ports.commit).toHaveBeenCalledTimes(1)
    expect(ports.commit).toHaveBeenCalledWith(["a"])
  })

  it("dedupes two schedules for one record in the same tick", async () => {
    const { ports, session } = setup()
    const [first, second] = await Promise.all([
      session.schedule([{ id: "a" }]),
      session.schedule([{ id: "a" }]),
    ])

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(ports.queue).toHaveBeenCalledTimes(1)
    expect(session.pendingIds()).toEqual(["a"])
  })

  it("ignores a second schedule for an already pending record", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }])
    expect(await session.schedule([{ id: "a" }])).toBe(true)

    expect(ports.queue).toHaveBeenCalledTimes(1)
    expect(session.pendingIds()).toEqual(["a"])
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).toHaveBeenCalledTimes(1)
  })

  it("pauses exactly the requested group out of three", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }], { flushPrevious: false })
    await session.schedule([{ id: "b" }], { flushPrevious: false })
    await session.schedule([{ id: "c" }], { flushPrevious: false })

    session.pause(["a"])
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)

    expect(ports.commit).not.toHaveBeenCalledWith(["a"])
    expect(ports.commit).toHaveBeenCalledWith(["b"])
    expect(ports.commit).toHaveBeenCalledWith(["c"])
    expect(session.pendingIds()).toEqual(["a"])

    session.resume(["a"])
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).toHaveBeenCalledWith(["a"])
  })

  it("pause(ids) freezes the matching group and extends its intent", async () => {
    const { ports, session } = setup()
    await session.schedule([{ id: "a" }], { flushPrevious: false })
    await session.schedule([{ id: "b" }], { flushPrevious: false })

    session.pause(["a"])
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    // The other group still commits; the paused one must not.
    expect(ports.commit).not.toHaveBeenCalledWith(["a"])
    // The durable deadline was extended with a new queue() call.
    expect(ports.queue).toHaveBeenLastCalledWith(
      ["a"],
      expect.any(Number),
    )

    session.resume(["a"])
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS)
    expect(ports.commit).toHaveBeenCalledWith(["a"])
  })
})
