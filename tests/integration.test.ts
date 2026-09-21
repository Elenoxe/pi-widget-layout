import { describe, expect, test } from "bun:test"
import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import { createDefaultConfig } from "../src/config.ts"
import {
  MANAGED_WIDGET_KEY,
  WidgetLayoutController,
  type WidgetLayoutUI,
} from "../src/layout-controller.ts"
import type { ManagedWidgetContent, ManagedWidgetFactory, WidgetPlacement } from "../src/types.ts"

interface MountedWidget {
  content: ManagedWidgetContent
  placement: WidgetPlacement
  component?: Component & { dispose?(): void }
}

class Harness implements WidgetLayoutUI {
  readonly widgets = new Map<string, MountedWidget>()
  rootMounts = 0
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
    content: ManagedWidgetFactory | undefined,
    options?: { placement?: WidgetPlacement },
  ): void
  setWidget(
    key: string,
    content: ManagedWidgetContent | undefined,
    options?: { placement?: WidgetPlacement },
  ): void {
    this.widgets.get(key)?.component?.dispose?.()
    this.widgets.delete(key)

    if (content === undefined) {
      return
    }

    if (key === MANAGED_WIDGET_KEY) {
      this.rootMounts += 1
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

function managedRoot(harness: Harness): Component {
  const root = harness.widgets.get(MANAGED_WIDGET_KEY)?.component
  if (root === undefined) {
    throw new Error("managed root is not mounted")
  }
  return root
}

function renderRoot(harness: Harness): string[] {
  return managedRoot(harness)
    .render(40)
    .map((line) => line.trimEnd())
}

describe("widget layout integration", () => {
  test("keeps one root and unchanged children alive across transitions", () => {
    const harness = new Harness()
    const controller = controllerFor(harness, ["alpha", "beta"], "below")
    controller.install()
    let creates = 0
    let disposals = 0
    const custom: ManagedWidgetFactory = () => {
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
    expect(harness.rootMounts).toBe(1)
    expect(creates).toBe(1)
    expect(disposals).toBe(0)
    expect(renderRoot(harness)).toEqual([" alpha", " custom"])

    harness.setWidget("alpha", ["alpha-updated"])
    expect(harness.rootMounts).toBe(1)
    expect(creates).toBe(1)
    expect(disposals).toBe(0)
    expect(renderRoot(harness)).toEqual([" alpha-updated", " custom"])

    harness.setWidget("alpha", undefined)
    expect(harness.rootMounts).toBe(1)
    expect(creates).toBe(1)
    expect(disposals).toBe(0)
    expect(renderRoot(harness)).toEqual([" custom"])

    harness.setWidget("beta", undefined)
    expect(harness.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
    expect(harness.rootMounts).toBe(1)
    expect(disposals).toBe(1)

    harness.setWidget("beta", custom)
    expect(harness.rootMounts).toBe(2)
    expect(creates).toBe(2)
    expect(disposals).toBe(1)

    controller.dispose()
    expect(harness.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
    expect(disposals).toBe(2)
  })

  test("resolves exact, wildcard, and catch-all selectors with stable slots", () => {
    const harness = new Harness()
    const controller = controllerFor(harness, ["*", "group-*", "exact"], "native")
    controller.install()

    harness.setWidget("other", ["other"])
    harness.setWidget("group-b", ["b"])
    harness.setWidget("exact", ["exact"])
    expect(renderRoot(harness)).toEqual([" other", " b", " exact"])

    harness.setWidget("group-b", undefined)
    harness.setWidget("group-b", ["b-readded"])
    harness.setWidget("group-a", ["a"])
    expect(renderRoot(harness)).toEqual([" other", " b-readded", " a", " exact"])

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
    expect(nativeHarness.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
    nativeController.dispose()

    const aboveHarness = new Harness()
    const aboveController = controllerFor(aboveHarness, ["managed"], "above")
    aboveController.install()

    aboveHarness.setWidget("unlisted", ["managed-unlisted"])
    expect(renderRoot(aboveHarness)).toEqual([" managed-unlisted"])

    aboveHarness.setWidget("managed", ["below"], { placement: "belowEditor" })
    expect(aboveHarness.widgets.get("managed")).toMatchObject({ placement: "belowEditor" })
    expect(renderRoot(aboveHarness)).toEqual([" managed-unlisted"])
    aboveController.dispose()
  })
})
