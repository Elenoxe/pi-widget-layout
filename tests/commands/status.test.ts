import { describe, expect, test } from "bun:test"
import type { CustomEntry, Theme } from "@earendil-works/pi-coding-agent"
import { type TuiMouseEvent, visibleWidth } from "@earendil-works/pi-tui"

import {
  renderStatusEntry,
  type StatusEntryData,
  WidgetLayoutStatusComponent,
  formatResolution,
  formatStatus,
} from "../../src/commands/status.ts"
import type { StatusConfig, WidgetLayoutSnapshot } from "../../src/types.ts"

const theme = {
  fg: (_color: string, text: string) => text,
} as Theme

function statusConfig(overrides: Partial<StatusConfig> = {}): StatusConfig {
  return {
    keyColumnMaxWidth: 24,
    maxCollapsedLines: 12,
    ...overrides,
  }
}

function snapshot(widgetCount = 0): WidgetLayoutSnapshot {
  return {
    sections: [
      {
        placement: "aboveEditor",
        unlisted: "native",
        order: ["native", "group-*", "*"],
        detached: [],
        widgets: Array.from({ length: widgetCount }, (_, index) => ({
          key: `widget-${index}`,
          active: true,
          resolution: {
            kind: "selector" as const,
            selector: index % 2 === 0 ? "group-*" : "*",
          },
        })),
      },
    ],
  }
}

function leftClick(): TuiMouseEvent {
  return {
    type: "click",
    button: "left",
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    width: 80,
    height: 12,
    shift: false,
    alt: false,
    ctrl: false,
  }
}

describe("status formatter", () => {
  test("formats selector and system resolutions distinctly", () => {
    expect(formatResolution({ kind: "selector", selector: "native" })).toBe("native")
    expect(formatResolution({ kind: "system", value: "native" })).toBe("[native]")
    expect(formatResolution({ kind: "system", value: "above" })).toBe("[above]")
    expect(formatResolution({ kind: "system", value: "below" })).toBe("[below]")
  })

  test("formats section structure and aligned widget lines", () => {
    const lines = formatStatus(
      {
        sections: [
          {
            ...snapshot().sections[0]!,
            widgets: [
              { key: "foo", active: false, resolution: { kind: "selector", selector: "native" } },
              {
                key: "group-a",
                active: true,
                resolution: { kind: "selector", selector: "group-*" },
              },
              { key: "notes", active: true, resolution: { kind: "system", value: "native" } },
            ],
          },
        ],
      },
      statusConfig(),
    )

    expect(lines.map((line) => line.text)).toEqual([
      "widget-layout",
      "aboveEditor  unlisted=[native]",
      "  order: native > group-* > *",
      "  ○ foo     → native",
      "  ● group-a → group-*",
      "  ● notes   → [native]",
    ])
    expect(lines.slice(3).every((line) => line.collapsible)).toBe(true)
  })

  test("uses fixed empty-state lines", () => {
    expect(formatStatus(snapshot(), statusConfig()).map((line) => line.text)).toEqual([
      "widget-layout",
      "aboveEditor  unlisted=[native]",
      "  order: native > group-* > *",
      "  widgets: —",
    ])

    expect(formatStatus({ sections: [] }, statusConfig()).map((line) => line.text)).toEqual([
      "widget-layout",
    ])
  })

  test("honors the configured key column width", () => {
    const keyedSnapshot: WidgetLayoutSnapshot = {
      sections: [
        {
          ...snapshot().sections[0]!,
          widgets: [
            {
              key: "x".repeat(30),
              active: true,
              resolution: { kind: "system", value: "native" },
            },
            { key: "foo", active: true, resolution: { kind: "system", value: "above" } },
          ],
        },
      ],
    }
    const narrow = formatStatus(keyedSnapshot, statusConfig({ keyColumnMaxWidth: 8 }))
    const wide = formatStatus(keyedSnapshot, statusConfig({ keyColumnMaxWidth: 24 }))
    const narrowFoo = narrow.find((line) => line.text.startsWith("  ● foo"))?.text
    const wideFoo = wide.find((line) => line.text.startsWith("  ● foo"))?.text

    expect(narrowFoo?.indexOf("→")).toBe(13)
    expect(wideFoo?.indexOf("→")).toBe(29)
  })
})

describe("WidgetLayoutStatusComponent", () => {
  test("collapses by final rendered line count and toggles with a left click", () => {
    const config = statusConfig()
    const component = new WidgetLayoutStatusComponent(
      formatStatus(snapshot(20), config),
      false,
      theme,
      config,
    )

    const collapsed = component.render(80)
    expect(collapsed.length).toBeLessThanOrEqual(config.maxCollapsedLines)
    expect(collapsed.join("\n")).toContain("…")
    expect(collapsed.join("\n")).toContain("widget-0")
    expect(collapsed.join("\n")).not.toContain("widget-19")

    expect(component.handleMouse({ ...leftClick(), button: "right" })).toBeUndefined()
    expect(component.handleMouse(leftClick())).toEqual({ handled: true, render: true })
    expect(component.render(80).join("\n")).toContain("widget-19")

    expect(component.handleMouse(leftClick())).toEqual({ handled: true, render: true })
    expect(component.render(80).join("\n")).toContain("…")
  })

  test("uses the configured collapsed line limit", () => {
    const compactConfig = statusConfig({ maxCollapsedLines: 6 })
    const roomyConfig = statusConfig({ maxCollapsedLines: 20 })
    const compact = new WidgetLayoutStatusComponent(
      formatStatus(snapshot(20), compactConfig),
      false,
      theme,
      compactConfig,
    )
    const roomy = new WidgetLayoutStatusComponent(
      formatStatus(snapshot(20), roomyConfig),
      false,
      theme,
      roomyConfig,
    )

    const compactLines = compact.render(80)
    const roomyLines = roomy.render(80)
    expect(compactLines.length).toBeLessThanOrEqual(6)
    expect(roomyLines.length).toBeLessThanOrEqual(20)
    expect(roomyLines.length).toBeGreaterThan(compactLines.length)
  })

  test("does not collapse or toggle short content", () => {
    const config = statusConfig()
    const component = new WidgetLayoutStatusComponent(
      formatStatus(snapshot(1), config),
      false,
      theme,
      config,
    )

    expect(component.render(120).join("\n")).not.toContain("more")
    expect(component.handleMouse(leftClick())).toBeUndefined()
  })

  test("starts expanded when Pi supplies expanded=true", () => {
    const config = statusConfig()
    const component = new WidgetLayoutStatusComponent(
      formatStatus(snapshot(20), config),
      true,
      theme,
      config,
    )

    expect(component.render(80).join("\n")).toContain("widget-19")
  })

  test("keeps rendered lines within the requested width", () => {
    const config = statusConfig()
    const component = new WidgetLayoutStatusComponent(
      formatStatus(
        {
          sections: [
            {
              ...snapshot().sections[0]!,
              widgets: [
                {
                  key: "some-extremely-long-widget-name-that-is-not-truncated",
                  active: true,
                  resolution: { kind: "system", value: "native" },
                },
              ],
            },
          ],
        },
        config,
      ),
      false,
      theme,
      config,
    )

    expect(component.render(24).every((line) => visibleWidth(line) <= 24)).toBe(true)
  })
  test("renders an empty entry with default data", () => {
    const component = renderStatusEntry(
      { data: undefined } as CustomEntry<StatusEntryData>,
      { expanded: false },
      theme,
    )

    expect(component.render(80)[0]?.trim()).toBe("widget-layout")
  })

  test.each([80, 24])(
    "collapses both sections within one rendered-line budget at width %i",
    (width) => {
      const config = statusConfig({ maxCollapsedLines: 18 })
      const sections = (["aboveEditor", "belowEditor"] as const).map((placement) => ({
        placement,
        unlisted: "native" as const,
        order: ["*"],
        detached: [],
        widgets: Array.from({ length: 8 }, (_, i) => ({
          key: `${placement}-${i}-long-widget`,
          active: true,
          resolution: { kind: "selector" as const, selector: "*" },
        })),
      }))
      const component = new WidgetLayoutStatusComponent(
        formatStatus({ sections }, config),
        false,
        theme,
        config,
      )
      const collapsed = component.render(width)
      const text = collapsed.join("\n")
      expect(collapsed.length).toBeLessThanOrEqual(18)
      expect(text).toContain("aboveEditor")
      expect(text).toContain("belowEditor")
      expect(text).toContain("more")
      expect(text).not.toContain("belowEditor-7")
      component.handleMouse(leftClick())
      const expanded = component.render(width).join("\n")
      expect(expanded).toContain("aboveEditor-7")
      expect(expanded).toContain("belowEditor-7")
      expect(expanded).not.toContain("more")
    },
  )

  test("preserves both section headers when they exceed the collapsed budget", () => {
    const config = statusConfig({ maxCollapsedLines: 1 })
    const above = snapshot(2).sections[0]!
    const component = new WidgetLayoutStatusComponent(
      formatStatus(
        {
          sections: [above, { ...above, placement: "belowEditor" }],
        },
        config,
      ),
      false,
      theme,
      config,
    )
    const rendered = component.render(80)
    expect(rendered.length).toBeGreaterThan(1)
    expect(rendered.join("\n")).toContain("aboveEditor")
    expect(rendered.join("\n")).toContain("belowEditor")
    expect(rendered.join("\n")).toContain("4 more")
    expect(rendered.join("\n")).not.toContain("widget-0")
  })
})
