import { describe, expect, test } from "bun:test"

import { WidgetRegistry } from "../src/registry.ts"
import type { WidgetRecord } from "../src/registry.ts"
import type { ManagedWidgetRoute } from "../src/layout.ts"

function selectorRoute(index: number, selector = "*"): ManagedWidgetRoute {
  return {
    kind: "managed",
    placement: "aboveEditor",
    bucket: { kind: "selector", selector, index },
  }
}

function unlistedRoute(index: number): ManagedWidgetRoute {
  return {
    kind: "managed",
    placement: "aboveEditor",
    bucket: { kind: "unlisted", index },
  }
}

function activeKeys(registry: WidgetRegistry<string>): string[] {
  return registry.getActiveRecords().map((record) => record.key)
}

describe("WidgetRegistry", () => {
  test("keeps first-seen order within a bucket", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("A", "a", selectorRoute(0))
    registry.set("B", "b", selectorRoute(0))

    expect(activeKeys(registry)).toEqual(["A", "B"])
    expect(registry.get("A")?.firstSeen).toBe(0)
    expect(registry.get("B")?.firstSeen).toBe(1)
  })

  test("clear and re-add preserves the original slot", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("A", "a", selectorRoute(0))
    registry.set("B", "b", selectorRoute(0))
    registry.clear("A")
    registry.set("A", "new-a", selectorRoute(0))

    expect(activeKeys(registry)).toEqual(["A", "B"])
    expect(registry.get("A")?.firstSeen).toBe(0)
  })

  test("a first clear does not create a slot", () => {
    const registry = new WidgetRegistry<string>()

    registry.clear("A")
    registry.set("B", "b", selectorRoute(0))
    registry.set("A", "a", selectorRoute(0))

    expect(activeKeys(registry)).toEqual(["B", "A"])
    expect(registry.get("A")?.firstSeen).toBe(1)
  })

  test("an undefined first set does not create a slot", () => {
    const registry = new WidgetRegistry<string>()

    expect(registry.set("A", undefined, selectorRoute(0))).toBeUndefined()
    registry.set("B", "b", selectorRoute(0))

    expect(activeKeys(registry)).toEqual(["B"])
  })

  test("content replacement preserves firstSeen and updates route", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("A", "old", selectorRoute(2, "old"))
    registry.set("A", "new", selectorRoute(1, "new"))

    expect(registry.get("A")).toEqual({
      key: "A",
      content: "new",
      route: selectorRoute(1, "new"),
      active: true,
      firstSeen: 0,
      revision: 1,
    })
  })

  test("increments revision for every explicit content update", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("A", "same", selectorRoute(0))
    expect(registry.get("A")?.revision).toBe(0)

    registry.set("A", "same", selectorRoute(0))
    expect(registry.get("A")?.revision).toBe(1)

    registry.clear("A")
    registry.set("A", "same", selectorRoute(0))
    expect(registry.get("A")?.revision).toBe(2)
  })

  test("bucket order dominates firstSeen order", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("later-bucket", "b", selectorRoute(2))
    registry.set("earlier-bucket", "a", selectorRoute(1))

    expect(activeKeys(registry)).toEqual(["earlier-bucket", "later-bucket"])
  })

  test("same bucket uses firstSeen order", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("second", "second", selectorRoute(3))
    registry.set("first", "first", selectorRoute(3))

    expect(activeKeys(registry)).toEqual(["second", "first"])
  })

  test("multiple widgets can share a wildcard-style bucket", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("group-b", "b", selectorRoute(1, "group-*"))
    registry.set("group-a", "a", selectorRoute(1, "group-*"))

    expect(activeKeys(registry)).toEqual(["group-b", "group-a"])
  })

  test("unlisted managed widgets follow explicit selector buckets", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("unlisted", "u", unlistedRoute(2))
    registry.set("explicit", "e", selectorRoute(1, "explicit"))

    expect(activeKeys(registry)).toEqual(["explicit", "unlisted"])
  })

  test("inactive records are excluded from active records", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("A", "a", selectorRoute(0))
    registry.set("B", "b", selectorRoute(0))
    registry.clear("A")

    expect(activeKeys(registry)).toEqual(["B"])
    expect(registry.get("A")).toMatchObject({ active: false, content: undefined })
  })

  test("reactivation restores the original position", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("A", "a", selectorRoute(0))
    registry.set("B", "b", selectorRoute(0))
    registry.clear("A")
    registry.set("A", "a-again", selectorRoute(0))

    expect(activeKeys(registry)).toEqual(["A", "B"])
  })

  test("reset clears records and restarts firstSeen", () => {
    const registry = new WidgetRegistry<string>()

    registry.set("A", "a", selectorRoute(0))
    registry.reset()
    registry.set("B", "b", selectorRoute(0))

    expect(registry.get("A")).toBeUndefined()
    expect(registry.get("B")?.firstSeen).toBe(0)
  })
  test("read results do not expose registry state", () => {
    const registry = new WidgetRegistry<string>()
    const route = selectorRoute(0)
    const setResult = registry.set("A", "a", route)
    const record = registry.get("A")
    const records = registry.getActiveRecords()

    if (record === undefined) {
      throw new Error("expected a registry record")
    }

    expect(record).not.toBe(setResult)
    expect(records[0]).not.toBe(record)

    const mutableSetResult = setResult as unknown as {
      key: string
      active: boolean
      content: string | undefined
      firstSeen: number
      revision: number
      route: ManagedWidgetRoute
    }
    mutableSetResult.key = "changed"
    mutableSetResult.active = false
    mutableSetResult.content = "changed"
    mutableSetResult.firstSeen = 999
    mutableSetResult.revision = 999
    mutableSetResult.route.bucket.index = 999

    const mutableRecord = record as unknown as {
      active: boolean
      content: string | undefined
      firstSeen: number
      revision: number
      route: ManagedWidgetRoute
    }
    mutableRecord.active = false
    mutableRecord.content = "changed"
    mutableRecord.firstSeen = 999
    mutableRecord.revision = 999
    mutableRecord.route.bucket.index = 999

    const mutableRecords = records as unknown as WidgetRecord<string>[]
    mutableRecords.pop()

    expect(registry.get("A")).toEqual({
      key: "A",
      content: "a",
      route,
      active: true,
      firstSeen: 0,
      revision: 0,
    })
    expect(registry.getActiveRecords()).toHaveLength(1)
  })
})
