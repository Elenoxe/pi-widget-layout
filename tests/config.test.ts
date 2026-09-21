import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import {
  DEFAULT_CONFIG,
  createDefaultConfig,
  loadWidgetLayoutConfig,
  parseWidgetLayoutConfig,
} from "../src/config.ts"

function makeTempDirectory(): string {
  return mkdtempSync(join(tmpdir(), "pi-widget-layout-"))
}

describe("parseWidgetLayoutConfig", () => {
  test("empty object returns defaults", () => {
    const result = parseWidgetLayoutConfig({})

    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.diagnostics).toEqual([])
  })

  test("parses a valid config", () => {
    const result = parseWidgetLayoutConfig({
      aboveEditor: {
        order: [" alpha ", "beta", "group-*"],
        unlisted: "above",
      },
      unknown: true,
    })

    expect(result.config).toEqual({
      aboveEditor: {
        order: ["alpha", "beta", "group-*"],
        unlisted: "above",
      },
    })
    expect(result.diagnostics).toEqual([])
  })

  test("accepts every legal unlisted policy", () => {
    for (const unlisted of ["native", "above", "below"] as const) {
      const result = parseWidgetLayoutConfig({ aboveEditor: { unlisted } })
      expect(result.config.aboveEditor.unlisted).toBe(unlisted)
      expect(result.diagnostics).toEqual([])
    }
  })

  test("invalid root falls back to defaults", () => {
    const result = parseWidgetLayoutConfig(null)

    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.code).toBe("invalid-root")
  })

  test("invalid aboveEditor falls back to its default", () => {
    const result = parseWidgetLayoutConfig({ aboveEditor: "invalid" })

    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.diagnostics[0]?.code).toBe("invalid-above-editor")
  })

  test("invalid order falls back to an empty order", () => {
    const result = parseWidgetLayoutConfig({ aboveEditor: { order: "invalid" } })

    expect(result.config.aboveEditor.order).toEqual([])
    expect(result.diagnostics[0]?.code).toBe("invalid-order")
  })

  test("invalid order items are discarded with diagnostics", () => {
    const result = parseWidgetLayoutConfig({
      aboveEditor: { order: ["valid", 123, null, false] },
    })

    expect(result.config.aboveEditor.order).toEqual(["valid"])
    expect(result.diagnostics.filter(({ code }) => code === "invalid-selector")).toHaveLength(3)
  })

  test("empty selectors are discarded", () => {
    const result = parseWidgetLayoutConfig({
      aboveEditor: { order: ["  ", "valid"] },
    })

    expect(result.config.aboveEditor.order).toEqual(["valid"])
    expect(result.diagnostics[0]?.code).toBe("invalid-selector")
  })

  test("selectors are trimmed", () => {
    const result = parseWidgetLayoutConfig({
      aboveEditor: { order: ["  valid  "] },
    })

    expect(result.config.aboveEditor.order).toEqual(["valid"])
  })

  test("duplicate selectors keep their first position", () => {
    const result = parseWidgetLayoutConfig({
      aboveEditor: { order: ["first", " first ", "second", "first"] },
    })

    expect(result.config.aboveEditor.order).toEqual(["first", "second"])
    expect(result.diagnostics.filter(({ code }) => code === "duplicate-selector")).toHaveLength(2)
  })

  test("invalid unlisted falls back to native", () => {
    const result = parseWidgetLayoutConfig({ aboveEditor: { unlisted: "sideways" } })

    expect(result.config.aboveEditor.unlisted).toBe("native")
    expect(result.diagnostics[0]?.code).toBe("invalid-unlisted")
  })

  test("default results do not share mutable order state", () => {
    const first = createDefaultConfig()
    first.aboveEditor.order.push("temporary")

    const second = parseWidgetLayoutConfig({})
    expect(second.config.aboveEditor.order).toEqual([])
  })
})

describe("loadWidgetLayoutConfig", () => {
  test("missing file returns defaults without a diagnostic", () => {
    const directory = makeTempDirectory()
    const filePath = join(directory, "missing.json")

    try {
      const result = loadWidgetLayoutConfig(filePath)
      expect(result.config).toEqual(DEFAULT_CONFIG)
      expect(result.diagnostics).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("malformed JSON fails open with a diagnostic", () => {
    const directory = makeTempDirectory()
    const filePath = join(directory, "widget-layout.json")
    writeFileSync(filePath, "{ invalid", "utf8")

    try {
      const result = loadWidgetLayoutConfig(filePath)
      expect(result.config).toEqual(DEFAULT_CONFIG)
      expect(result.diagnostics[0]?.code).toBe("invalid-json")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("loads a custom path", () => {
    const directory = makeTempDirectory()
    const filePath = join(directory, "custom.json")
    writeFileSync(
      filePath,
      JSON.stringify({ aboveEditor: { order: ["custom"], unlisted: "below" } }),
      "utf8",
    )

    try {
      const result = loadWidgetLayoutConfig(filePath)
      expect(result.config.aboveEditor.order).toEqual(["custom"])
      expect(result.config.aboveEditor.unlisted).toBe("below")
      expect(result.diagnostics).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
