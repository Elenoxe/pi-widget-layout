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
    const result = routeWidget(
      "group-special",
      "aboveEditor",
      config("below", ["*", "group-*", "*-special"]),
    )

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
      bucket: { kind: "unlisted", position: "above", index: -1 },
    })
  })

  test("places unlisted below after all selectors inside the host", () => {
    expect(routeWidget("foo", "aboveEditor", config("below", ["a", "b"]))).toEqual({
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "unlisted", position: "below", index: 2 },
    })
  })

  test("an explicit catch-all prevents unlisted fallback", () => {
    const result = routeWidget("foo", "aboveEditor", config("below", ["*"]))

    expect(result).toEqual({
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "selector", selector: "*", index: 0 },
    })
  })
})
