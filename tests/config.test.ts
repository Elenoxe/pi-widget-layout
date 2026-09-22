import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import {
  createDefaultConfig,
  loadWidgetLayoutConfig,
  parseWidgetLayoutConfig,
} from "../src/config.ts"

describe("parseWidgetLayoutConfig", () => {
  test("empty object returns defaults", () => {
    const result = parseWidgetLayoutConfig({})

    expect(result.config).toEqual({
      status: {
        keyColumnMaxWidth: 24,
        maxCollapsedLines: 12,
      },
      aboveEditor: {
        unlisted: "native",
        order: [],
      },
    })
    expect(result.diagnostics).toEqual([])
  })

  test("parses status and aboveEditor", () => {
    const result = parseWidgetLayoutConfig({
      status: {
        keyColumnMaxWidth: 8,
        maxCollapsedLines: 20,
      },
      aboveEditor: {
        unlisted: "above",
        order: [" alpha ", "beta", "group-*"],
      },
      unknown: true,
    })

    expect(result.config).toEqual({
      status: {
        keyColumnMaxWidth: 8,
        maxCollapsedLines: 20,
      },
      aboveEditor: {
        unlisted: "above",
        order: ["alpha", "beta", "group-*"],
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

    expect(result.config).toEqual(createDefaultConfig())
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.code).toBe("invalid-root")
  })

  test("invalid status falls back to defaults with a diagnostic", () => {
    const result = parseWidgetLayoutConfig({ status: "invalid" })

    expect(result.config.status).toEqual({
      keyColumnMaxWidth: 24,
      maxCollapsedLines: 12,
    })
    expect(result.diagnostics[0]?.code).toBe("invalid-status")
  })

  test("invalid keyColumnMaxWidth falls back without clamping", () => {
    for (const value of [0, -1, 1.5, "8"]) {
      const result = parseWidgetLayoutConfig({ status: { keyColumnMaxWidth: value } })

      expect(result.config.status.keyColumnMaxWidth).toBe(24)
      expect(result.diagnostics[0]?.code).toBe("invalid-key-column-max-width")
    }
  })

  test("invalid maxCollapsedLines falls back without clamping", () => {
    for (const value of [0, -1, 1.5, "20"]) {
      const result = parseWidgetLayoutConfig({ status: { maxCollapsedLines: value } })

      expect(result.config.status.maxCollapsedLines).toBe(12)
      expect(result.diagnostics[0]?.code).toBe("invalid-max-collapsed-lines")
    }
  })

  test("one invalid status field does not affect the other", () => {
    const result = parseWidgetLayoutConfig({
      status: { keyColumnMaxWidth: 8, maxCollapsedLines: 0 },
    })

    expect(result.config.status).toEqual({
      keyColumnMaxWidth: 8,
      maxCollapsedLines: 12,
    })
    expect(result.diagnostics).toEqual([
      {
        code: "invalid-max-collapsed-lines",
        message: "status.maxCollapsedLines must be a positive integer.",
      },
    ])
  })

  test("invalid aboveEditor falls back to its default", () => {
    const result = parseWidgetLayoutConfig({ aboveEditor: "invalid" })

    expect(result.config).toEqual(createDefaultConfig())
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

function makeTempDirectory(): string {
  return mkdtempSync(join(tmpdir(), "pi-widget-layout-"))
}

describe("loadWidgetLayoutConfig", () => {
  test("missing file returns defaults without a diagnostic", () => {
    const directory = makeTempDirectory()
    const filePath = join(directory, "missing.json")

    try {
      const result = loadWidgetLayoutConfig(filePath)
      expect(result.config).toEqual(createDefaultConfig())
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
      expect(result.config).toEqual(createDefaultConfig())
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
      JSON.stringify({
        status: { keyColumnMaxWidth: 8, maxCollapsedLines: 20 },
        aboveEditor: { unlisted: "below", order: ["custom"] },
      }),
      "utf8",
    )

    try {
      const result = loadWidgetLayoutConfig(filePath)
      expect(result.config.status).toEqual({ keyColumnMaxWidth: 8, maxCollapsedLines: 20 })
      expect(result.config.aboveEditor.order).toEqual(["custom"])
      expect(result.config.aboveEditor.unlisted).toBe("below")
      expect(result.diagnostics).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  test("reports a read error for an unreadable config path", () => {
    const directory = makeTempDirectory()

    try {
      const result = loadWidgetLayoutConfig(directory)
      expect(result.config).toEqual(createDefaultConfig())
      expect(result.diagnostics[0]?.code).toBe("read-error")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("ignores project config when the project is untrusted", () => {
    const directory = makeTempDirectory()
    const projectDirectory = join(directory, ".pi")
    mkdirSync(projectDirectory)
    writeFileSync(
      join(projectDirectory, "widget-layout.json"),
      JSON.stringify({ aboveEditor: { order: ["__project_only__"] } }),
      "utf8",
    )

    try {
      const result = loadWidgetLayoutConfig({ cwd: directory, projectTrusted: false })
      expect(result.config.aboveEditor.order).not.toContain("__project_only__")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("loads project config when the project is trusted", () => {
    const directory = makeTempDirectory()
    const projectDirectory = join(directory, ".pi")
    mkdirSync(projectDirectory)
    writeFileSync(
      join(projectDirectory, "widget-layout.json"),
      JSON.stringify({ aboveEditor: { order: ["__project_only__"] } }),
      "utf8",
    )

    try {
      const result = loadWidgetLayoutConfig({ cwd: directory, projectTrusted: true })
      expect(result.config.aboveEditor.order).toEqual(["__project_only__"])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
