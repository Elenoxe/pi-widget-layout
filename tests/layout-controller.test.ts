import { describe, expect, test } from "bun:test"
import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import {
  MANAGED_WIDGET_KEY,
  WidgetLayoutController,
  type WidgetLayoutUI,
} from "../src/layout-controller.ts"
import type { ManagedWidgetContent, ManagedWidgetFactory } from "../src/types.ts"
import type { WidgetPlacement } from "../src/types.ts"
import { createDefaultConfig } from "../src/config.ts"

interface FakeWidget {
  content: ManagedWidgetContent
  placement: WidgetPlacement
  component?: Component & { dispose?(): void }
}

class FakeUi implements WidgetLayoutUI {
  readonly widgets = new Map<string, FakeWidget>()
  readonly calls: Array<{
    key: string
    content: ManagedWidgetContent | undefined
    placement?: WidgetPlacement
  }> = []
  private readonly tui = {} as TUI
  private readonly theme = {} as Theme

  setWidget(
    key: string,
    content: string[] | undefined,
    options?: { placement?: WidgetPlacement },
  ): void
  setWidget(
    key: string,
    content: ManagedWidgetFactory | undefined,
    options?: { placement?: WidgetPlacement },
  ): void
  setWidget(
    key: string,
    content: ManagedWidgetContent | undefined,
    options?: { placement?: WidgetPlacement },
  ): void {
    const existing = this.widgets.get(key)
    existing?.component?.dispose?.()
    this.calls.push({ key, content, placement: options?.placement })

    if (content === undefined) {
      this.widgets.delete(key)
      return
    }

    const component = typeof content === "function" ? content(this.tui, this.theme) : undefined
    this.widgets.set(key, {
      content,
      placement: options?.placement ?? "aboveEditor",
      component,
    })
  }
}

function config(unlisted: "native" | "above" | "below" = "native") {
  return {
    ...createDefaultConfig(),
    aboveEditor: { order: ["managed", "managed-2"], unlisted },
  }
}

function root(ui: FakeUi): Component & { dispose?(): void } {
  const component = ui.widgets.get(MANAGED_WIDGET_KEY)?.component
  if (component === undefined) {
    throw new Error("managed root is not mounted")
  }
  return component
}

describe("WidgetLayoutController", () => {
  test("routes managed content through one root", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    ui.setWidget("managed", ["first"])
    ui.setWidget("managed-2", ["second"])

    expect([...ui.widgets.keys()]).toEqual([MANAGED_WIDGET_KEY])
    expect(
      root(ui)
        .render(40)
        .map((line) => line.trimEnd()),
    ).toEqual([" first", " second"])
    expect(
      ui.calls.filter((call) => call.key === MANAGED_WIDGET_KEY && call.content !== undefined),
    ).toHaveLength(2)
  })

  test("forwards native widgets without mounting a root", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    const content: ManagedWidgetContent = ["native"]
    ui.setWidget("other", content, { placement: "belowEditor" })

    expect(ui.widgets.get("other")).toMatchObject({ content, placement: "belowEditor" })
    expect(ui.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
  })

  test("moves a widget from native ownership to managed ownership", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    ui.setWidget("managed", ["native"], { placement: "belowEditor" })
    ui.setWidget("managed", ["managed"])

    expect(ui.widgets.has("managed")).toBe(false)
    expect(
      root(ui)
        .render(40)
        .map((line) => line.trimEnd()),
    ).toEqual([" managed"])
    expect(ui.calls.slice(-3).map((call) => [call.key, call.content, call.placement])).toEqual([
      ["managed", ["native"], "belowEditor"],
      ["managed", undefined, undefined],
      ["pi-widget-layout:managed-root", expect.any(Function), "aboveEditor"],
    ])
  })

  test("moves a widget from managed ownership to native ownership", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    ui.setWidget("managed", ["managed"])
    ui.setWidget("managed", ["native"], { placement: "belowEditor" })

    expect(ui.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
    expect(ui.widgets.get("managed")).toMatchObject({
      content: ["native"],
      placement: "belowEditor",
    })
  })

  test("dispose restores the original setter and clears only the managed root", () => {
    const ui = new FakeUi()
    const originalSetWidget = ui.setWidget
    const controller = new WidgetLayoutController(ui, config())
    controller.install()
    ui.setWidget("managed", ["managed"])

    controller.dispose()
    expect(ui.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
    expect(ui.setWidget).toBe(originalSetWidget)

    ui.setWidget("managed", ["native"], { placement: "belowEditor" })
    expect(ui.widgets.get("managed")).toMatchObject({ placement: "belowEditor" })
  })
})
