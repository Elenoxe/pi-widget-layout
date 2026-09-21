import { describe, expect, test } from "bun:test"

import { compileOrder, matchWidget } from "../src/matcher.ts"

describe("compileOrder and matchWidget", () => {
  test("exact selectors beat wildcard selectors", () => {
    const order = compileOrder(["group-*", "group-a"])

    expect(matchWidget("group-a", order)).toEqual({
      selector: "group-a",
      index: 1,
      kind: "exact",
    })
  })

  test("exact selectors beat catch-all selectors", () => {
    const order = compileOrder(["*", "group-a"])

    expect(matchWidget("group-a", order)).toEqual({
      selector: "group-a",
      index: 1,
      kind: "exact",
    })
  })

  test("wildcard selectors beat catch-all selectors", () => {
    const order = compileOrder(["*", "group-*"])

    expect(matchWidget("group-b", order)).toEqual({
      selector: "group-*",
      index: 1,
      kind: "wildcard",
    })
  })

  test("earlier wildcard selectors win same-tier conflicts", () => {
    const order = compileOrder(["group-*", "*-special-*"])

    expect(matchWidget("group-special-item", order)).toEqual({
      selector: "group-*",
      index: 0,
      kind: "wildcard",
    })
  })

  test("preserves an exact selector bucket index", () => {
    const order = compileOrder(["*", "group-*", "group-a"])

    expect(matchWidget("group-a", order)?.index).toBe(2)
  })

  test("preserves a wildcard selector bucket index", () => {
    const order = compileOrder(["*", "group-*", "other"])

    expect(matchWidget("group-b", order)?.index).toBe(1)
  })

  test("preserves a catch-all bucket index", () => {
    const order = compileOrder(["specific", "*"])

    expect(matchWidget("other", order)).toEqual({
      selector: "*",
      index: 1,
      kind: "catchAll",
    })
  })

  test("returns undefined when there is no match", () => {
    const order = compileOrder(["specific"])

    expect(matchWidget("other", order)).toBeUndefined()
  })

  test("anchors wildcard matching to the complete key", () => {
    const order = compileOrder(["group-*"])

    expect(matchWidget("group-a", order)).toBeDefined()
    expect(matchWidget("x-group-a", order)).toBeUndefined()
  })

  test("escapes regex characters other than wildcard", () => {
    const order = compileOrder(["foo.bar-*"])

    expect(matchWidget("foo.bar-value", order)).toBeDefined()
    expect(matchWidget("fooXbar-value", order)).toBeUndefined()
  })

  test("allows a wildcard to match an empty suffix", () => {
    const order = compileOrder(["group-*"])

    expect(matchWidget("group-", order)).toBeDefined()
  })

  test("catch-all matches any key, including an empty key", () => {
    const order = compileOrder(["*"])

    expect(matchWidget("", order)?.kind).toBe("catchAll")
    expect(matchWidget("anything", order)?.kind).toBe("catchAll")
  })
})
