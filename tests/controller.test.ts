import { describe, expect, test } from "bun:test"
import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import { HOST_WIDGET_KEYS, WidgetLayoutController, type WidgetLayoutUI } from "../src/controller.ts"

import type { WidgetContent, WidgetFactory } from "../src/types.ts"
import type { WidgetPlacement } from "../src/types.ts"
import { createDefaultConfig } from "../src/config.ts"
import { formatStatus } from "../src/commands/status.ts"

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

  test("snapshots physical order after host remount and global placement moves", () => {
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
          detached: [],
          widgets: [
            { key: "unlisted", active: true, resolution: { kind: "system", value: "native" } },
            { key: "later", active: true, resolution: { kind: "system", value: "native" } },
            { key: "managed", active: true, resolution: { kind: "selector", selector: "managed" } },
            { key: "below", active: true, resolution: { kind: "system", value: "native" } },
          ],
        },
        { placement: "belowEditor", unlisted: "native", order: [], widgets: [], detached: [] },
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
      { key: "unlisted", active: true, resolution: { kind: "system", value: "above" } },
    ])
    expect(belowController.getSnapshot().sections[0]?.widgets).toEqual([
      { key: "unlisted", active: true, resolution: { kind: "system", value: "below" } },
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
  test("preserves logical slots, tracks physical updates, and detaches globally unique native keys", () => {
    const ui = new FakeUi()
    const settings = {
      ...config(),
      belowEditor: { unlisted: "native" as const, order: ["managed", "managed-2"] },
    }
    const controller = new WidgetLayoutController(ui, settings)
    controller.install()
    const above = () => controller.getSnapshot().sections[0]!
    const keys = () => above().widgets.map((widget) => widget.key)
    const assertUnique = () => {
      const all = controller
        .getSnapshot()
        .sections.flatMap((section) =>
          [...section.widgets, ...section.detached].map((widget) => widget.key),
        )
      expect(new Set(all).size).toBe(all.length)
    }
    ui.setWidget("unknown", undefined)
    expect(above().detached).toEqual([])
    ui.setWidget("before", ["before"])
    ui.setWidget("managed-2", ["second"])
    ui.setWidget("managed", ["first"])
    ui.setWidget("after", ["after"])
    expect(keys()).toEqual(["before", "managed", "managed-2", "after"])
    ui.setWidget("managed", undefined)
    expect(above().widgets[1]?.active).toBe(false)
    ui.setWidget("managed-2", undefined)
    expect(ui.widgets.has(HOST_WIDGET_KEY)).toBe(false)
    expect(keys()).toEqual(["before", "managed", "managed-2", "after"])
    ui.setWidget("before", ["updated"])
    expect(keys()).toEqual(["managed", "managed-2", "after", "before"])
    ui.setWidget("managed", ["remounted"])
    expect(keys()).toEqual(["after", "before", "managed", "managed-2"])
    ui.setWidget("before", undefined)
    ui.setWidget("after", undefined)
    expect(above().detached.map((widget) => widget.key)).toEqual(["after", "before"])
    ui.setWidget("before", undefined)
    expect(above().detached.map((widget) => widget.key)).toEqual(["before", "after"])
    const lines = formatStatus(controller.getSnapshot(), settings.status)
    expect(lines.every((line) => line.text.trim().length > 0)).toBe(true)
    expect(lines.some((line) => line.text === "unmanaged")).toBe(false)
    expect(lines.some((line) => line.text === "    ○ before")).toBe(true)
    expect(
      lines.filter((line) => line.text.includes("detached:")).map((line) => line.text),
    ).toEqual(["  detached:"])
    ui.setWidget("managed", ["below"], { placement: "belowEditor" })
    expect(keys()).toEqual(["managed-2"])
    assertUnique()
    ui.setWidget("managed", undefined)
    expect(controller.getSnapshot().sections[1]?.widgets[0]?.active).toBe(false)
    ui.setWidget("before", ["below"], { placement: "belowEditor" })
    expect(above().detached.map((widget) => widget.key)).toEqual(["after"])
    ui.setWidget("before", undefined)
    assertUnique()
    expect(controller.getSnapshot().sections[1]?.detached.map((widget) => widget.key)).toEqual([
      "before",
    ])
    controller.dispose()
    expect(
      controller
        .getSnapshot()
        .sections.every((section) => section.widgets.length === 0 && section.detached.length === 0),
    ).toBe(true)
  })
  test("reloads active routes and stable historical slots without waiting for widget updates", () => {
    const ui = new FakeUi()
    const original = config()
    const controller = new WidgetLayoutController(ui, original)
    controller.install()
    ui.setWidget("native-before", ["before"])
    ui.setWidget("managed", ["managed"])
    ui.setWidget("managed-2", ["second"])
    ui.setWidget("native-after", ["after"])
    ui.setWidget("managed-2", undefined)
    ui.setWidget("retired", ["retired"])
    ui.setWidget("retired", undefined)
    const updated = {
      ...original,
      aboveEditor: {
        unlisted: "native" as const,
        order: ["native-after", "managed-2", "native-before", "managed"],
      },
    }
    controller.reload(updated)
    const above = controller.getSnapshot().sections[0]!
    expect(above.order).toEqual(updated.aboveEditor.order)
    expect(above.widgets.map(({ key, active }) => [key, active])).toEqual([
      ["native-after", true],
      ["managed-2", false],
      ["native-before", true],
      ["managed", true],
    ])
    expect(above.detached.map(({ key }) => key)).toEqual(["retired"])
    expect(ui.widgets.has("native-before")).toBe(false)
    expect(ui.widgets.has("native-after")).toBe(false)
    expect(host(ui).render(80).join("\n")).toContain("after")
    const again = {
      ...original,
      aboveEditor: { unlisted: "native" as const, order: ["native-before", "managed"] },
    }
    controller.reload(again)
    expect(
      controller.getSnapshot().sections[0]!.widgets.map(({ key, active }) => [key, active]),
    ).toEqual([
      ["native-after", true],
      ["native-before", true],
      ["managed", true],
    ])
    expect(controller.getSnapshot().sections[0]!.detached.map(({ key }) => key)).toContain(
      "managed-2",
    )
    expect(ui.widgets.has("native-after")).toBe(true)
    ui.setWidget("managed", undefined)
    ui.setWidget("native-before", undefined)
    controller.reload(updated)
    expect(
      controller
        .getSnapshot()
        .sections[0]?.widgets.some(({ key, active }) => key === "managed" && !active),
    ).toBe(true)
    const withRetired = {
      ...updated,
      aboveEditor: {
        unlisted: "native" as const,
        order: ["retired", ...updated.aboveEditor.order],
      },
    }
    controller.reload(withRetired)
    expect(
      controller
        .getSnapshot()
        .sections[0]?.widgets.some(({ key, active }) => key === "retired" && !active),
    ).toBe(true)
    expect(
      controller.getSnapshot().sections[0]?.detached.some(({ key }) => key === "retired"),
    ).toBe(false)
    controller.dispose()
  })
  test("unchanged layout and status-only reload keep factory components mounted", () => {
    const ui = new FakeUi()
    const settings = config()
    const controller = new WidgetLayoutController(ui, settings)
    controller.install()
    let creations = 0
    let disposals = 0
    const factory: WidgetFactory = () => {
      creations += 1
      return {
        render: () => ["widget"],
        invalidate() {},
        dispose() {
          disposals += 1
        },
      }
    }
    ui.setWidget("managed", factory)
    ui.setWidget("native", factory)
    const hostComponent = ui.widgets.get(HOST_WIDGET_KEY)?.component
    const nativeComponent = ui.widgets.get("native")?.component
    const calls = ui.calls.length
    controller.reload({
      ...settings,
      aboveEditor: { ...settings.aboveEditor, order: [...settings.aboveEditor.order] },
    })
    controller.reload({ ...settings, status: { ...settings.status, maxCollapsedLines: 20 } })
    expect(ui.calls).toHaveLength(calls)
    expect(ui.widgets.get(HOST_WIDGET_KEY)?.component).toBe(hostComponent)
    expect(ui.widgets.get("native")?.component).toBe(nativeComponent)
    expect(creations).toBe(2)
    expect(disposals).toBe(0)
    controller.dispose()
  })
})
