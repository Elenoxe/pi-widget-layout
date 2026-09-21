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

function managedRoot(harness: Harness): Component {
  const root = harness.widgets.get(MANAGED_WIDGET_KEY)?.component
  if (root === undefined) {
    throw new Error("managed root is not mounted")
  }
  return root
}

describe("widget layout integration", () => {
  test("preserves routing and ownership invariants across transitions", () => {
    const harness = new Harness()
    const controller = new WidgetLayoutController(harness, {
      ...createDefaultConfig(),
      aboveEditor: { order: ["alpha", "beta"], unlisted: "below" },
    })
    const originalSetWidget = harness.setWidget
    controller.install()
    let disposed = 0
    const custom: ManagedWidgetFactory = () => ({
      render: () => [" custom"],
      invalidate: () => undefined,
      dispose: () => {
        disposed += 1
      },
    })

    harness.setWidget("unlisted", ["unlisted"])
    expect(harness.widgets.get("unlisted")).toMatchObject({ placement: "belowEditor" })
    expect(harness.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)

    harness.setWidget("alpha", ["alpha"])
    harness.setWidget("beta", custom)
    expect([...harness.widgets.keys()].filter((key) => key === MANAGED_WIDGET_KEY)).toHaveLength(1)
    expect(
      managedRoot(harness)
        .render(40)
        .map((line) => line.trimEnd()),
    ).toEqual([" alpha", " custom"])

    harness.setWidget("alpha", ["native"], { placement: "belowEditor" })
    expect(harness.widgets.get("alpha")).toMatchObject({ placement: "belowEditor" })
    expect(
      managedRoot(harness)
        .render(40)
        .map((line) => line.trimEnd()),
    ).toEqual([" custom"])
    expect(disposed).toBe(1)
    expect([...harness.widgets.keys()].filter((key) => key === MANAGED_WIDGET_KEY)).toHaveLength(1)

    harness.setWidget("beta", undefined)
    expect(harness.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
    expect(harness.widgets.has("unlisted")).toBe(true)
    expect(harness.widgets.has("alpha")).toBe(true)

    harness.setWidget("beta", ["again"])
    expect([...harness.widgets.keys()].filter((key) => key === MANAGED_WIDGET_KEY)).toHaveLength(1)
    expect(harness.rootMounts).toBe(4)

    controller.dispose()
    expect(harness.widgets.has(MANAGED_WIDGET_KEY)).toBe(false)
    expect(harness.setWidget).toBe(originalSetWidget)
    expect(harness.widgets.has("alpha")).toBe(true)
    expect(harness.widgets.has("unlisted")).toBe(true)
  })
})
