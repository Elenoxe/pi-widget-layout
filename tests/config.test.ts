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
      belowEditor: { unlisted: "native", order: [] },
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
      belowEditor: { unlisted: "native", order: [] },
    })
    expect(result.diagnostics).toEqual([])
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

  for (const placement of ["aboveEditor", "belowEditor"] as const) {
    test.each(["native", "above", "below"] as const)(
      `${placement} accepts unlisted=%s`,
      (unlisted) => {
        const result = parseWidgetLayoutConfig({ [placement]: { unlisted } })
        expect(result.config[placement].unlisted).toBe(unlisted)
        expect(result.diagnostics).toEqual([])
      },
    )

    test(`${placement} validates and normalizes selectors`, () => {
      const result = parseWidgetLayoutConfig({
        [placement]: { order: [" first ", 123, null, false, "  ", "second", "first"] },
      })
      expect(result.config[placement].order).toEqual(["first", "second"])
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "invalid-selector",
        "invalid-selector",
        "invalid-selector",
        "invalid-selector",
        "duplicate-selector",
      ])
      expect(
        result.diagnostics.every(({ message }) => message.includes(`${placement}.order`)),
      ).toBe(true)
    })

    test(`${placement} rejects invalid sections and fields independently`, () => {
      const invalidSection = parseWidgetLayoutConfig({ [placement]: "invalid" })
      expect(invalidSection.config).toEqual(createDefaultConfig())
      expect(invalidSection.diagnostics[0]?.message).toContain(placement)
      const invalidFields = parseWidgetLayoutConfig({
        [placement]: { order: "invalid", unlisted: "sideways" },
      })
      expect(invalidFields.config).toEqual(createDefaultConfig())
      expect(invalidFields.diagnostics.map(({ code }) => code)).toEqual([
        "invalid-unlisted",
        "invalid-order",
      ])
      const other = placement === "aboveEditor" ? "belowEditor" : "aboveEditor"
      const mixed = parseWidgetLayoutConfig({ [placement]: null, [other]: { order: ["valid"] } })
      expect(mixed.config[other].order).toEqual(["valid"])
    })
  }

  test("defaults and parsed sections do not share mutable order state", () => {
    const base = createDefaultConfig()
    const parsed = parseWidgetLayoutConfig({}, base).config
    parsed.aboveEditor.order.push("above")
    parsed.belowEditor.order.push("below")
    expect(base).toEqual(createDefaultConfig())
    expect(parsed.aboveEditor.order).toEqual(["above"])
    expect(parsed.belowEditor.order).toEqual(["below"])
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

  test("merges trusted project fields over isolated global config and combines diagnostics", () => {
    const directory = makeTempDirectory()
    try {
      const agentDir = join(directory, "agent")
      const projectDir = join(directory, ".pi")
      mkdirSync(agentDir)
      mkdirSync(projectDir)
      writeFileSync(
        join(agentDir, "widget-layout.json"),
        JSON.stringify({
          status: { keyColumnMaxWidth: 9, maxCollapsedLines: 0 },
          aboveEditor: { unlisted: "above", order: ["global"] },
          belowEditor: { unlisted: "below", order: ["global-below"] },
        }),
      )
      writeFileSync(
        join(projectDir, "widget-layout.json"),
        JSON.stringify({
          status: { maxCollapsedLines: 18 },
          aboveEditor: { unlisted: "native" },
          belowEditor: { unlisted: "invalid", order: ["project"] },
        }),
      )
      // The global config path is captured at module load; isolate it before importing.
      const child = Bun.spawnSync(
        [
          process.execPath,
          "--eval",
          `
        import { loadWidgetLayoutConfig } from ${JSON.stringify(new URL("../src/config.ts", import.meta.url).href)};
        console.log(JSON.stringify([false, true].map(projectTrusted =>
          loadWidgetLayoutConfig({ cwd: ${JSON.stringify(directory)}, projectTrusted }))));
      `,
        ],
        { env: { ...process.env, PI_CODING_AGENT_DIR: agentDir } },
      )
      expect(child.exitCode).toBe(0)
      expect(child.stderr.toString()).toBe("")
      const [untrusted, trusted] = JSON.parse(child.stdout.toString())
      expect(untrusted.config).toEqual({
        status: { keyColumnMaxWidth: 9, maxCollapsedLines: 12 },
        aboveEditor: { unlisted: "above", order: ["global"] },
        belowEditor: { unlisted: "below", order: ["global-below"] },
      })
      expect(untrusted.diagnostics.map((d: { code: string }) => d.code)).toEqual([
        "invalid-max-collapsed-lines",
      ])
      expect(trusted.config).toEqual({
        status: { keyColumnMaxWidth: 9, maxCollapsedLines: 18 },
        aboveEditor: { unlisted: "native", order: ["global"] },
        belowEditor: { unlisted: "below", order: ["project"] },
      })
      expect(trusted.diagnostics.map((d: { code: string }) => d.code)).toEqual([
        "invalid-max-collapsed-lines",
        "invalid-unlisted",
      ])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
