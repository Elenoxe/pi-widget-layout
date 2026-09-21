import { describe, expect, test } from "bun:test"
import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import { createDefaultConfig } from "../src/config.ts"
import { HOST_WIDGET_KEY, WidgetLayoutController, type WidgetLayoutUI } from "../src/controller.ts"
import type { WidgetContent, WidgetFactory, WidgetPlacement } from "../src/types.ts"

interface MountedWidget {
  content: WidgetContent
  placement: WidgetPlacement
  component?: Component & { dispose?(): void }
}

class Harness implements WidgetLayoutUI {
  readonly widgets = new Map<string, MountedWidget>()
  hostMounts = 0
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
    this.widgets.get(key)?.component?.dispose?.()
    this.widgets.delete(key)

    if (content === undefined) {
      return
    }

    if (key === HOST_WIDGET_KEY) {
      this.hostMounts += 1
    }

    const component = typeof content === "function" ? content(this.tui, this.theme) : undefined
    this.widgets.set(key, {
      content,
      placement: options?.placement ?? "aboveEditor",
      component,
    })
  }
}

function controllerFor(
  harness: Harness,
  order: string[],
  unlisted: "native" | "above" | "below",
): WidgetLayoutController {
  return new WidgetLayoutController(harness, {
    ...createDefaultConfig(),
    aboveEditor: { order, unlisted },
  })
}

function managedHost(harness: Harness): Component {
  const host = harness.widgets.get(HOST_WIDGET_KEY)?.component
  if (host === undefined) {
    throw new Error("managed host is not mounted")
  }
  return host
}

function renderHost(harness: Harness): string[] {
  return managedHost(harness)
    .render(40)
    .map((line) => line.trimEnd())
}

describe("widget layout integration", () => {
  test("keeps one host and unchanged children alive across transitions", () => {
    const harness = new Harness()
    const controller = controllerFor(harness, ["alpha", "beta"], "below")
    controller.install()
    let creates = 0
    let disposals = 0
    const custom: WidgetFactory = () => {
      creates += 1
      return {
        render: () => [" custom"],
        invalidate: () => undefined,
        dispose: () => {
          disposals += 1
        },
      }
    }

    harness.setWidget("alpha", ["alpha"])
    harness.setWidget("beta", custom)
    expect(harness.hostMounts).toBe(1)
    expect(creates).toBe(1)
    expect(disposals).toBe(0)
    expect(renderHost(harness)).toEqual([" alpha", " custom"])

    harness.setWidget("beta", custom)
    expect(harness.hostMounts).toBe(1)
    expect(creates).toBe(2)
    expect(disposals).toBe(1)
    expect(renderHost(harness)).toEqual([" alpha", " custom"])

    harness.setWidget("alpha", ["alpha-updated"])
    expect(harness.hostMounts).toBe(1)
    expect(creates).toBe(2)
    expect(disposals).toBe(1)
    expect(renderHost(harness)).toEqual([" alpha-updated", " custom"])

    harness.setWidget("alpha", undefined)
    expect(harness.hostMounts).toBe(1)
    expect(creates).toBe(2)
    expect(disposals).toBe(1)
    expect(renderHost(harness)).toEqual([" custom"])

    harness.setWidget("beta", undefined)
    expect(harness.widgets.has(HOST_WIDGET_KEY)).toBe(false)
    expect(harness.hostMounts).toBe(1)
    expect(disposals).toBe(2)

    harness.setWidget("beta", custom)
    expect(harness.hostMounts).toBe(2)
    expect(creates).toBe(3)
    expect(disposals).toBe(2)

    controller.dispose()
    expect(harness.widgets.has(HOST_WIDGET_KEY)).toBe(false)
    expect(disposals).toBe(3)
  })

  test("resolves exact, wildcard, and catch-all selectors with stable slots", () => {
    const harness = new Harness()
    const controller = controllerFor(harness, ["*", "group-*", "exact"], "native")
    controller.install()

    harness.setWidget("other", ["other"])
    harness.setWidget("group-b", ["b"])
    harness.setWidget("exact", ["exact"])
    expect(renderHost(harness)).toEqual([" other", " b", " exact"])

    harness.setWidget("group-b", undefined)
    harness.setWidget("group-b", ["b-readded"])
    harness.setWidget("group-a", ["a"])
    expect(renderHost(harness)).toEqual([" other", " b-readded", " a", " exact"])

    controller.dispose()
  })

  test("honors unlisted policies and always bypasses managed routing below the editor", () => {
    const nativeHarness = new Harness()
    const nativeController = controllerFor(nativeHarness, ["managed"], "native")
    nativeController.install()

    nativeHarness.setWidget("unlisted", ["native"])
    nativeHarness.setWidget("managed", ["below"], { placement: "belowEditor" })
    expect(nativeHarness.widgets.get("unlisted")).toMatchObject({ placement: "aboveEditor" })
    expect(nativeHarness.widgets.get("managed")).toMatchObject({ placement: "belowEditor" })
    expect(nativeHarness.widgets.has(HOST_WIDGET_KEY)).toBe(false)
    nativeController.dispose()

    const aboveHarness = new Harness()
    const aboveController = controllerFor(aboveHarness, ["managed"], "above")
    aboveController.install()

    aboveHarness.setWidget("unlisted", ["managed-unlisted"])
    expect(renderHost(aboveHarness)).toEqual([" managed-unlisted"])

    aboveHarness.setWidget("managed", ["below"], { placement: "belowEditor" })
    expect(aboveHarness.widgets.get("managed")).toMatchObject({ placement: "belowEditor" })
    expect(renderHost(aboveHarness)).toEqual([" managed-unlisted"])
    aboveController.dispose()
  })
})
