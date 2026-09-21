import { describe, expect, test } from "bun:test"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import type { ExtensionWidgetOptions } from "@earendil-works/pi-coding-agent"

import extension from "../src/index.ts"
import type { WidgetContent } from "../src/types.ts"

interface FakeUi {
  setWidget: (
    key: string,
    content: WidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ) => void
  calls: Array<{
    key: string
    content: WidgetContent | undefined
    options?: ExtensionWidgetOptions
  }>
  notifications: Array<{ message: string; type?: "info" | "warning" | "error" }>
}

interface FakeEvents {
  session_start?: (event: unknown, context: ExtensionContext) => void
  session_shutdown?: (event: unknown, context: ExtensionContext) => void
}

function fakeUi(): FakeUi {
  const ui: FakeUi = {
    calls: [],
    notifications: [],
    setWidget: () => undefined,
  }
  ui.setWidget = (key, content, options) => {
    ui.calls.push({ key, content, options })
  }
  return ui
}

function fakeContext(ui: FakeUi, mode: "tui" | "rpc"): ExtensionContext {
  return { hasUI: true, mode, ui } as unknown as ExtensionContext
}

function extensionEvents(): FakeEvents {
  const events: FakeEvents = {}
  const pi = {
    on(
      event: "session_start" | "session_shutdown",
      handler: (event: unknown, context: ExtensionContext) => void,
    ) {
      events[event] = handler
      return () => undefined
    },
  }
  extension(pi as unknown as ExtensionAPI)
  return events
}

describe("widget layout extension", () => {
  test("installs for TUI sessions and restores the host setter on shutdown", () => {
    const events = extensionEvents()
    const ui = fakeUi()
    const originalSetWidget = ui.setWidget
    const context = fakeContext(ui, "tui")

    events.session_start?.({}, context)
    expect(ui.setWidget).not.toBe(originalSetWidget)

    ui.setWidget("native", ["line"], { placement: "belowEditor" })
    expect(ui.calls).toEqual([
      { key: "native", content: ["line"], options: { placement: "belowEditor" } },
    ])

    events.session_shutdown?.({}, context)
    expect(ui.setWidget).toBe(originalSetWidget)
  })

  test("does not patch non-TUI contexts", () => {
    const events = extensionEvents()
    const ui = fakeUi()
    const originalSetWidget = ui.setWidget

    events.session_start?.({}, fakeContext(ui, "rpc"))

    expect(ui.setWidget).toBe(originalSetWidget)
  })
})
