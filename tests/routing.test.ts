import { describe, expect, test } from "bun:test"

import { createDefaultConfig } from "../src/config.ts"
import { routeWidget } from "../src/routing.ts"
import type { WidgetLayoutConfig } from "../src/types.ts"

function config(
  unlisted: WidgetLayoutConfig["aboveEditor"]["unlisted"],
  order: string[],
): WidgetLayoutConfig {
  return {
    ...createDefaultConfig(),
    aboveEditor: { unlisted, order },
  }
}

describe("routeWidget", () => {
  test("always bypasses originally requested belowEditor widgets", () => {
    const result = routeWidget("foo", "belowEditor", config("above", ["*", "foo"]))

    expect(result).toEqual({ kind: "native", placement: "belowEditor" })
  })

  test("routes an exact match to its selector bucket", () => {
    const result = routeWidget(
      "group-a",
      "aboveEditor",
      config("below", ["*", "group-*", "group-a"]),
    )

    expect(result).toEqual({
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "selector", selector: "group-a", index: 2 },
    })
  })

  test("routes a wildcard match to its selector bucket", () => {
    const result = routeWidget("group-b", "aboveEditor", config("below", ["*", "group-*"]))

    expect(result).toEqual({
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "selector", selector: "group-*", index: 1 },
    })
  })

  test("routes a catch-all match to its selector bucket", () => {
    const result = routeWidget("foo", "aboveEditor", config("below", ["specific", "*"]))

    expect(result).toEqual({
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "selector", selector: "*", index: 1 },
    })
  })

  test("keeps an unmatched widget native aboveEditor", () => {
    const result = routeWidget("foo", "aboveEditor", config("native", ["group-*"]))

    expect(result).toEqual({ kind: "native", placement: "aboveEditor" })
  })

  test("manages an unmatched widget in the implicit above bucket", () => {
    const result = routeWidget("foo", "aboveEditor", config("above", ["group-*", "other-*"]))

    expect(result).toEqual({
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "unlisted", index: 2 },
    })
  })

  test("places the implicit bucket after every explicit selector", () => {
    const result = routeWidget("foo", "aboveEditor", config("above", ["a", "b", "c"]))

    expect(result.kind).toBe("managed")
    if (result.kind === "managed") {
      expect(result.bucket.index).toBe(3)
    }
  })

  test("moves an unmatched widget below when unlisted is below", () => {
    const result = routeWidget("foo", "aboveEditor", config("below", ["group-*"]))

    expect(result).toEqual({ kind: "native", placement: "belowEditor" })
  })

  test("an explicit catch-all prevents unlisted fallback", () => {
    const result = routeWidget("foo", "aboveEditor", config("below", ["*"]))

    expect(result).toEqual({
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "selector", selector: "*", index: 0 },
    })
  })

  test("exact precedence is reflected in the exact bucket index", () => {
    const result = routeWidget(
      "group-a",
      "aboveEditor",
      config("native", ["*", "group-*", "group-a"]),
    )

    expect(result.kind).toBe("managed")
    if (result.kind === "managed") {
      expect(result.bucket).toEqual({ kind: "selector", selector: "group-a", index: 2 })
    }
  })

  test("wildcard precedence is reflected in the earlier wildcard bucket index", () => {
    const result = routeWidget(
      "group-special",
      "aboveEditor",
      config("native", ["*", "group-*", "*-special"]),
    )

    expect(result.kind).toBe("managed")
    if (result.kind === "managed") {
      expect(result.bucket).toEqual({ kind: "selector", selector: "group-*", index: 1 })
    }
  })
})
