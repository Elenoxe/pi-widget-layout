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
}

interface FakeEvents {
  session_start?: (event: unknown, context: ExtensionContext) => void
  session_shutdown?: (event: unknown, context: ExtensionContext) => void
}

function fakeUi(): FakeUi {
  const ui: FakeUi = {
    calls: [],
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
    registerCommand() {
      return undefined
    },
    registerEntryRenderer() {
      return undefined
    },
    appendEntry() {
      return undefined
    },
  }
  extension(pi as unknown as ExtensionAPI)
  return events
}

describe("widget layout extension lifecycle", () => {
  test("installs the controller for TUI sessions and restores the setter", () => {
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

  test("does not install for non-TUI contexts", () => {
    const events = extensionEvents()
    const ui = fakeUi()
    const originalSetWidget = ui.setWidget

    events.session_start?.({}, fakeContext(ui, "rpc"))

    expect(ui.setWidget).toBe(originalSetWidget)
  })

  test("disposes and reinstalls on session restart", () => {
    const events = extensionEvents()
    const ui = fakeUi()
    const originalSetWidget = ui.setWidget
    const context = fakeContext(ui, "tui")

    events.session_start?.({}, context)
    const firstControllerSetter = ui.setWidget
    events.session_start?.({}, context)
    const secondControllerSetter = ui.setWidget

    expect(firstControllerSetter).not.toBe(originalSetWidget)
    expect(secondControllerSetter).not.toBe(originalSetWidget)
    expect(secondControllerSetter).not.toBe(firstControllerSetter)

    events.session_shutdown?.({}, context)
    expect(ui.setWidget).toBe(originalSetWidget)
  })
})
