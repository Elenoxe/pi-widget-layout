import { describe, expect, test } from "bun:test"
import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import { ManagedWidgetRoot } from "../src/managed-root.ts"
import type { WidgetRecord } from "../src/registry.ts"
import type { ManagedWidgetContent } from "../src/types.ts"

function record(
  key: string,
  content: ManagedWidgetContent,
  firstSeen: number,
): WidgetRecord<ManagedWidgetContent> {
  return {
    key,
    content,
    route: {
      kind: "managed",
      placement: "aboveEditor",
      bucket: { kind: "selector", selector: "*", index: 0 },
    },
    active: true,
    firstSeen,
  }
}

function component(lines: string[], onDispose?: () => void): Component & { dispose?(): void } {
  return {
    render: () => lines,
    invalidate: () => undefined,
    dispose: onDispose,
  }
}

describe("ManagedWidgetRoot", () => {
  test("renders managed records in registry order", () => {
    const root = new ManagedWidgetRoot(
      [record("first", ["one"], 0), record("second", ["two", "three"], 1)],
      {} as TUI,
      {} as Theme,
    )

    expect(root.render(20).map((line) => line.trimEnd())).toEqual([" one", " two", " three"])
  })

  test("creates and disposes component content", () => {
    let disposed = false
    let receivedTui: TUI | undefined
    let receivedTheme: Theme | undefined
    const tui = {} as TUI
    const theme = {} as Theme
    const content: ManagedWidgetContent = (actualTui, actualTheme) => {
      receivedTui = actualTui
      receivedTheme = actualTheme
      return component(["custom"], () => {
        disposed = true
      })
    }
    const root = new ManagedWidgetRoot([record("custom", content, 0)], tui, theme)

    expect(receivedTui).toBe(tui)
    expect(receivedTheme).toBe(theme)
    expect(root.render(20)).toEqual(["custom"])

    root.dispose()
    expect(disposed).toBe(true)
    expect(root.render(20)).toEqual([])
  })

  test("truncates long string content like the native widget path", () => {
    const theme = { fg: (_color: string, text: string) => `muted:${text}` } as unknown as Theme
    const root = new ManagedWidgetRoot(
      [
        record(
          "long",
          Array.from({ length: 11 }, (_, index) => String(index)),
          0,
        ),
      ],
      {} as TUI,
      theme,
    )

    expect(root.render(20).map((line) => line.trimEnd())).toEqual([
      " 0",
      " 1",
      " 2",
      " 3",
      " 4",
      " 5",
      " 6",
      " 7",
      " 8",
      " 9",
      " muted:... (widget",
      " truncated)",
    ])
  })
})
