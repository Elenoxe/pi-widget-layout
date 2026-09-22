import { describe, expect, test } from "bun:test"

import { createDefaultConfig } from "../src/config.ts"
import { routeWidget } from "../src/routing.ts"
import type { UnlistedPolicy } from "../src/types.ts"

for (const placement of ["aboveEditor", "belowEditor"] as const) {
  describe(`routeWidget ${placement}`, () => {
    function config(unlisted: UnlistedPolicy, order: string[]) {
      return { ...createDefaultConfig(), [placement]: { unlisted, order } }
    }

    test("uses only the requested region's configuration", () => {
      const other = placement === "aboveEditor" ? "belowEditor" : "aboveEditor"
      const layout = {
        ...createDefaultConfig(),
        [other]: { unlisted: "above" as const, order: ["*"] },
      }
      expect(routeWidget("foo", placement, layout)).toEqual({ kind: "native", placement })
    })

    test.each([
      ["group-a", ["*", "group-*", "group-a"], "group-a", 2],
      ["group-special", ["*", "group-*", "*-special"], "group-*", 1],
      ["foo", ["specific", "*"], "*", 1],
    ] as const)("routes %s to its winning selector bucket", (key, order, selector, index) => {
      expect(routeWidget(key, placement, config("below", [...order]))).toEqual({
        kind: "managed",
        placement,
        bucket: { kind: "selector", selector, index },
      })
    })

    test("keeps unmatched widgets native", () => {
      expect(routeWidget("foo", placement, config("native", ["group-*"]))).toEqual({
        kind: "native",
        placement,
      })
    })

    test.each(["above", "below"] as const)("places unlisted %s within the region", (position) => {
      expect(routeWidget("foo", placement, config(position, ["a", "b"]))).toEqual({
        kind: "managed",
        placement,
        bucket: { kind: "unlisted", position, index: position === "above" ? -1 : 2 },
      })
    })
  })
}
