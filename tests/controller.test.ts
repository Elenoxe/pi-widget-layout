import { describe, expect, test } from "bun:test"
import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import { HOST_WIDGET_KEYS, WidgetLayoutController, type WidgetLayoutUI } from "../src/controller.ts"

import type { WidgetContent, WidgetFactory } from "../src/types.ts"
import type { WidgetPlacement } from "../src/types.ts"
import { createDefaultConfig } from "../src/config.ts"

const HOST_WIDGET_KEY = HOST_WIDGET_KEYS.aboveEditor

interface FakeWidget {
  content: WidgetContent
  placement: WidgetPlacement
  component?: Component & { dispose?(): void }
}

class FakeUi implements WidgetLayoutUI {
  readonly widgets = new Map<string, FakeWidget>()
  readonly calls: Array<{
    key: string
    content: WidgetContent | undefined
    placement?: WidgetPlacement
  }> = []
  renderRequests = 0
  private readonly tui = {
    requestRender: () => {
      this.renderRequests += 1
    },
  } as unknown as TUI
  private readonly theme = {} as Theme

  setWidget(
    key: string,
    content: string[] | undefined,
    options?: { placement?: WidgetPlacement },
  ): void
  setWidget(
    key: string,
    content: WidgetFactory | undefined,
    options?: { placement?: WidgetPlacement },
  ): void
  setWidget(
    key: string,
    content: WidgetContent | undefined,
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
    aboveEditor: { unlisted, order: ["managed", "managed-2"] },
  }
}

function host(ui: FakeUi): Component & { dispose?(): void } {
  const component = ui.widgets.get(HOST_WIDGET_KEY)?.component
  if (component === undefined) {
    throw new Error("managed host is not mounted")
  }
  return component
}

describe("WidgetLayoutController", () => {
  test("forwards native widgets without mounting a host", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    const content: WidgetContent = ["native"]
    ui.setWidget("other", content, { placement: "belowEditor" })

    expect(ui.widgets.get("other")).toMatchObject({ content, placement: "belowEditor" })
    expect(ui.widgets.has(HOST_WIDGET_KEY)).toBe(false)
  })

  test("snapshots above-editor observations in first-seen order", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    ui.setWidget("managed", ["managed"])
    ui.setWidget("unlisted", ["native"])
    ui.setWidget("below", ["below"], { placement: "belowEditor" })
    ui.setWidget("later", ["later"])
    ui.setWidget("managed", undefined)
    ui.setWidget("managed", ["managed-again"])
    ui.setWidget("below", ["above-again"])

    expect(controller.getSnapshot()).toEqual({
      sections: [
        {
          placement: "aboveEditor",
          unlisted: "native",
          order: ["managed", "managed-2"],
          widgets: [
            { key: "managed", resolution: { kind: "selector", selector: "managed" } },
            { key: "unlisted", resolution: { kind: "system", value: "native" } },
            { key: "later", resolution: { kind: "system", value: "native" } },
            { key: "below", resolution: { kind: "system", value: "native" } },
          ],
        },
        { placement: "belowEditor", unlisted: "native", order: [], widgets: [] },
      ],
    })

    const snapshot = controller.getSnapshot()
    const section = snapshot.sections[0]
    if (section === undefined) {
      throw new Error("snapshot section is missing")
    }
    ;(section.order as string[]).push("mutated")
    expect(controller.getSnapshot().sections[0]?.order).toEqual(["managed", "managed-2"])
  })

  test("maps unlisted above and below policies to system resolutions", () => {
    const aboveUi = new FakeUi()
    const aboveController = new WidgetLayoutController(aboveUi, config("above"))
    aboveController.install()
    aboveUi.setWidget("unlisted", ["above"])

    const belowUi = new FakeUi()
    const belowController = new WidgetLayoutController(belowUi, config("below"))
    belowController.install()
    belowUi.setWidget("unlisted", ["below"])

    expect(aboveController.getSnapshot().sections[0]?.widgets).toEqual([
      { key: "unlisted", resolution: { kind: "system", value: "above" } },
    ])
    expect(belowController.getSnapshot().sections[0]?.widgets).toEqual([
      { key: "unlisted", resolution: { kind: "system", value: "below" } },
    ])
  })
  test("moves a widget from native ownership to managed ownership", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    ui.setWidget("managed", ["native"], { placement: "belowEditor" })
    ui.setWidget("managed", ["managed"])

    expect(ui.widgets.has("managed")).toBe(false)
    expect(
      host(ui)
        .render(40)
        .map((line) => line.trimEnd()),
    ).toEqual([" managed"])
    expect(ui.calls.slice(-3).map((call) => [call.key, call.content, call.placement])).toEqual([
      ["managed", ["native"], "belowEditor"],
      ["managed", undefined, undefined],
      [HOST_WIDGET_KEY, expect.any(Function), "aboveEditor"],
    ])
  })

  test("moves a widget from managed ownership to native ownership", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()

    ui.setWidget("managed", ["managed"])
    ui.setWidget("managed", ["native"], { placement: "belowEditor" })

    expect(ui.widgets.has(HOST_WIDGET_KEY)).toBe(false)
    expect(ui.widgets.get("managed")).toMatchObject({
      content: ["native"],
      placement: "belowEditor",
    })
  })

  test("leaves a disposed interceptor transparent in a later wrapper", () => {
    const ui = new FakeUi()
    const controller = new WidgetLayoutController(ui, config())
    controller.install()
    ui.setWidget("managed", ["before"])

    const previous = ui.setWidget
    let laterCalls = 0
    const later = ((
      key: string,
      content: WidgetContent | undefined,
      options?: { placement?: WidgetPlacement },
    ) => {
      laterCalls += 1
      if (typeof content === "function") {
        previous(key, content, options)
      } else {
        previous(key, content, options)
      }
    }) as typeof ui.setWidget
    ui.setWidget = later

    controller.dispose()
    expect(ui.setWidget).toBe(later)
    expect(ui.widgets.has(HOST_WIDGET_KEY)).toBe(false)

    ui.setWidget("managed", ["after"])
    expect(laterCalls).toBe(1)
    expect(ui.widgets.get("managed")).toMatchObject({ content: ["after"] })
    expect(ui.widgets.has(HOST_WIDGET_KEY)).toBe(false)
  })

  test("dispose restores the previous setter and clears only the managed host", () => {
    const ui = new FakeUi()
    const previousSetWidget = ui.setWidget
    const controller = new WidgetLayoutController(ui, config())
    controller.install()
    ui.setWidget("managed", ["managed"])

    controller.dispose()
    expect(ui.widgets.has(HOST_WIDGET_KEY)).toBe(false)
    expect(ui.setWidget).toBe(previousSetWidget)

    ui.setWidget("managed", ["native"], { placement: "belowEditor" })
    expect(ui.widgets.get("managed")).toMatchObject({ placement: "belowEditor" })
  })
})
