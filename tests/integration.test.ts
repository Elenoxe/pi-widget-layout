import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import extension from "../src/index.ts"
import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import { createDefaultConfig } from "../src/config.ts"
import { HOST_WIDGET_KEYS, WidgetLayoutController, type WidgetLayoutUI } from "../src/controller.ts"
import type { WidgetContent, WidgetFactory, WidgetPlacement } from "../src/types.ts"

const HOST_WIDGET_KEY = HOST_WIDGET_KEYS.aboveEditor

interface MountedWidget {
  content: WidgetContent
  placement: WidgetPlacement
  component?: Component & { dispose?(): void }
}

class Harness implements WidgetLayoutUI {
  readonly notifications: string[] = []
  notify(message: string): void {
    this.notifications.push(message)
  }
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

    if (key === HOST_WIDGET_KEYS.aboveEditor || key === HOST_WIDGET_KEYS.belowEditor) {
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
  unlisted: "native" | "above" | "below",
  order: string[],
): WidgetLayoutController {
  return new WidgetLayoutController(harness, {
    ...createDefaultConfig(),
    aboveEditor: { unlisted, order },
  })
}

function managedHost(harness: Harness, placement: WidgetPlacement = "aboveEditor"): Component {
  const host = harness.widgets.get(HOST_WIDGET_KEYS[placement])?.component
  if (host === undefined) {
    throw new Error("managed host is not mounted")
  }
  return host
}

function renderHost(harness: Harness, placement: WidgetPlacement = "aboveEditor"): string[] {
  return managedHost(harness, placement)
    .render(40)
    .map((line) => line.trimEnd())
}

describe("widget layout integration", () => {
  test("keeps one host and unchanged children alive across transitions", () => {
    const harness = new Harness()
    const controller = controllerFor(harness, "below", ["alpha", "beta"])
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
    const controller = controllerFor(harness, "native", ["*", "group-*", "exact"])
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

  test("keeps below-editor widgets native when only aboveEditor is configured", () => {
    const nativeHarness = new Harness()
    const nativeController = controllerFor(nativeHarness, "native", ["managed"])
    nativeController.install()

    nativeHarness.setWidget("unlisted", ["native"])
    nativeHarness.setWidget("managed", ["below"], { placement: "belowEditor" })
    expect(nativeHarness.widgets.get("unlisted")).toMatchObject({ placement: "aboveEditor" })
    expect(nativeHarness.widgets.get("managed")).toMatchObject({ placement: "belowEditor" })
    expect(nativeHarness.widgets.has(HOST_WIDGET_KEY)).toBe(false)
    nativeController.dispose()

    const aboveHarness = new Harness()
    const aboveController = controllerFor(aboveHarness, "above", ["managed"])
    aboveController.install()

    aboveHarness.setWidget("unlisted", ["managed-unlisted"])
    expect(renderHost(aboveHarness)).toEqual([" managed-unlisted"])

    aboveHarness.setWidget("managed", ["below"], { placement: "belowEditor" })
    expect(aboveHarness.widgets.get("managed")).toMatchObject({ placement: "belowEditor" })
    expect(renderHost(aboveHarness)).toEqual([" managed-unlisted"])
    aboveController.dispose()
  })

  test("keeps both hosts ordered independently and updates only the affected region", () => {
    const harness = new Harness()
    const controller = new WidgetLayoutController(harness, {
      ...createDefaultConfig(),
      aboveEditor: { unlisted: "native", order: ["alpha", "*"] },
      belowEditor: { unlisted: "native", order: ["omega", "*"] },
    })
    controller.install()
    let creates = 0
    let disposals = 0
    harness.setWidget("other-above", ["a"])
    harness.setWidget("other-below", ["b"], { placement: "belowEditor" })
    harness.setWidget("alpha", ["alpha"])
    harness.setWidget(
      "omega",
      () => {
        creates += 1
        return {
          render: () => [" omega"],
          invalidate() {},
          dispose() {
            disposals += 1
          },
        }
      },
      { placement: "belowEditor" },
    )
    const belowHost = managedHost(harness, "belowEditor")
    expect(harness.hostMounts).toBe(2)
    expect(harness.widgets.get(HOST_WIDGET_KEYS.aboveEditor)?.placement).toBe("aboveEditor")
    expect(harness.widgets.get(HOST_WIDGET_KEYS.belowEditor)?.placement).toBe("belowEditor")
    expect(renderHost(harness)).toEqual([" alpha", " a"])
    expect(renderHost(harness, "belowEditor")).toEqual([" omega", " b"])
    const before = harness.renderRequests
    harness.setWidget("alpha", ["updated"])
    expect(harness.renderRequests - before).toBe(1)
    expect(managedHost(harness, "belowEditor")).toBe(belowHost)
    expect(creates).toBe(1)
    expect(disposals).toBe(0)
    harness.setWidget("alpha", undefined)
    harness.setWidget("other-above", undefined)
    expect(harness.widgets.has(HOST_WIDGET_KEYS.aboveEditor)).toBe(false)
    expect(managedHost(harness, "belowEditor")).toBe(belowHost)
    controller.dispose()
    controller.dispose()
    expect(disposals).toBe(1)
    expect(harness.widgets.size).toBe(0)
    expect(controller.getSnapshot().sections.map((s) => s.widgets)).toEqual([[], []])
  })

  for (const placement of ["aboveEditor", "belowEditor"] as const) {
    test(`moves managed widgets from ${placement} and restores each region's original slot`, () => {
      const other = placement === "aboveEditor" ? "belowEditor" : "aboveEditor"
      const harness = new Harness()
      const controller = new WidgetLayoutController(harness, {
        ...createDefaultConfig(),
        aboveEditor: { unlisted: "native", order: ["*"] },
        belowEditor: { unlisted: "native", order: ["*"] },
      })
      const original = harness.setWidget
      controller.install()
      const events: string[] = []
      let creates = 0
      const moving: WidgetFactory = () => {
        const id = ++creates
        events.push(`create-${id}`)
        return {
          render: () => [" moving"],
          invalidate() {},
          dispose() {
            events.push(`dispose-${id}`)
          },
        }
      }
      harness.setWidget("moving", moving, { placement })
      harness.setWidget("peer", ["peer"], { placement })
      harness.setWidget("other-peer", ["other-peer"], { placement: other })
      harness.setWidget("moving", moving, { placement: other })
      expect(events).toEqual(["create-1", "dispose-1", "create-2"])
      expect(renderHost(harness, placement)).toEqual([" peer"])
      expect(renderHost(harness, other)).toEqual([" other-peer", " moving"])
      expect(
        controller
          .getSnapshot()
          .sections.find((s) => s.placement === other)
          ?.widgets.map((w) => w.key),
      ).toEqual(["other-peer", "moving"])
      harness.setWidget("moving", moving, { placement })
      expect(renderHost(harness, placement)).toEqual([" moving", " peer"])
      expect(
        controller
          .getSnapshot()
          .sections.find((s) => s.placement === placement)
          ?.widgets.map((w) => w.key),
      ).toEqual(["moving", "peer"])
      expect(harness.hostMounts).toBe(2)
      // Omitted placement must clear belowEditor too; mismatched placement must also clear by key.
      harness.setWidget("moving", undefined)
      harness.setWidget("other-peer", undefined, { placement })
      expect(harness.widgets.has(HOST_WIDGET_KEYS[other])).toBe(false)
      expect(renderHost(harness, placement)).toEqual([" peer"])
      expect(events).toEqual([
        "create-1",
        "dispose-1",
        "create-2",
        "dispose-2",
        "create-3",
        "dispose-3",
      ])
      controller.dispose()
      expect(harness.setWidget).toBe(original)
      controller.install()
      harness.setWidget("new", ["new"], { placement })
      expect(
        controller
          .getSnapshot()
          .sections.find((s) => s.placement === placement)
          ?.widgets.map((w) => w.key),
      ).toEqual(["new"])
      controller.dispose()
    })

    test(`moves between native ${placement} and managed ownership without leaking components`, () => {
      const managed = placement === "aboveEditor" ? "belowEditor" : "aboveEditor"
      const harness = new Harness()
      const controller = new WidgetLayoutController(harness, {
        ...createDefaultConfig(),
        [managed]: { unlisted: "native", order: ["moving", "peer"] },
      })
      controller.install()
      let disposed = 0
      const moving: WidgetFactory = () => ({
        render: () => [" moving"],
        invalidate() {},
        dispose() {
          disposed += 1
        },
      })
      harness.setWidget("peer", ["peer"], { placement: managed })
      harness.setWidget("moving", moving, { placement })
      harness.setWidget("moving", moving, { placement: managed })
      expect(disposed).toBe(1)
      expect(harness.widgets.has("moving")).toBe(false)
      expect(renderHost(harness, managed)).toEqual([" moving", " peer"])
      harness.setWidget("moving", moving, { placement })
      expect(disposed).toBe(2)
      expect(renderHost(harness, managed)).toEqual([" peer"])
      expect(harness.widgets.get("moving")?.placement).toBe(placement)
      expect(
        controller.getSnapshot().sections.find((s) => s.placement === placement)?.widgets,
      ).toEqual([{ key: "moving", active: true, resolution: { kind: "system", value: "native" } }])
      controller.dispose()
      expect(disposed).toBe(2)
      expect(harness.widgets.has("moving")).toBe(true)
      harness.setWidget("moving", undefined)
      expect(disposed).toBe(3)
    })

    test.each(["above", "below"] as const)(
      `${placement} renders unlisted %s with stable first-seen slots`,
      (position) => {
        const harness = new Harness()
        const controller = new WidgetLayoutController(harness, {
          ...createDefaultConfig(),
          [placement]: { unlisted: position, order: ["selected"] },
        })
        controller.install()
        const keys =
          position === "above"
            ? ["selected", "unlisted-a", "unlisted-b"]
            : ["unlisted-a", "selected", "unlisted-b"]
        for (const key of keys) harness.setWidget(key, [key], { placement })
        const expected =
          position === "above"
            ? [" unlisted-a", " unlisted-b", " selected"]
            : [" selected", " unlisted-a", " unlisted-b"]
        expect(renderHost(harness, placement)).toEqual(expected)
        harness.setWidget("unlisted-a", undefined)
        harness.setWidget("unlisted-a", ["unlisted-a"], { placement })
        expect(renderHost(harness, placement)).toEqual(expected)
        expect(harness.hostMounts).toBe(1)
        expect(harness.widgets.get(HOST_WIDGET_KEYS[placement])?.placement).toBe(placement)
        expect(
          controller.getSnapshot().sections.find((s) => s.placement === placement)?.widgets,
        ).toContainEqual({
          key: "unlisted-a",
          active: true,
          resolution: { kind: "system", value: position },
        })
        controller.dispose()
      },
    )
  }

  test("session restart and shutdown release both hosts and restore the original setter", () => {
    const directory = mkdtempSync(join(tmpdir(), "widget-layout-session-"))
    try {
      mkdirSync(join(directory, ".pi"))
      writeFileSync(
        join(directory, ".pi", "widget-layout.json"),
        JSON.stringify({
          aboveEditor: { unlisted: "native", order: ["*"] },
          belowEditor: { unlisted: "native", order: ["*"] },
        }),
      )
      const harness = new Harness()
      const original = harness.setWidget
      const events = new Map<string, (event: unknown, ctx: ExtensionContext) => void>()
      extension({
        on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) =>
          events.set(name, handler),
        registerCommand() {},
        registerEntryRenderer() {},
      } as unknown as ExtensionAPI)
      const context = {
        hasUI: true,
        mode: "tui",
        cwd: directory,
        isProjectTrusted: () => true,
        ui: harness,
      } as unknown as ExtensionContext
      events.get("session_start")!({}, { ...context, hasUI: false })
      expect(harness.setWidget).toBe(original)
      let disposals = 0
      const content: WidgetFactory = () => ({
        render: () => ["widget"],
        invalidate() {},
        dispose() {
          disposals += 1
        },
      })
      const mountBoth = () => {
        harness.setWidget("a", content)
        harness.setWidget("b", content, { placement: "belowEditor" })
      }
      events.get("session_start")!({}, context)
      mountBoth()
      expect(harness.widgets.size).toBe(2)
      const firstSetter = harness.setWidget
      events.get("session_start")!({}, context)
      expect(disposals).toBe(2)
      expect(harness.widgets.size).toBe(0)
      expect(harness.setWidget).not.toBe(firstSetter)
      mountBoth()
      events.get("session_shutdown")!({}, context)
      expect(disposals).toBe(4)
      expect(harness.widgets.size).toBe(0)
      expect(harness.setWidget).toBe(original)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  test("reload command reads project config and immediately reorders mounted widgets", async () => {
    const directory = mkdtempSync(join(tmpdir(), "widget-layout-reload-"))
    try {
      mkdirSync(join(directory, ".pi"))
      const path = join(directory, ".pi", "widget-layout.json")
      writeFileSync(path, JSON.stringify({ aboveEditor: { order: ["first", "second"] } }))
      const harness = new Harness()
      const events = new Map<string, (event: unknown, ctx: ExtensionContext) => void>()
      let command: (args: string, ctx: ExtensionContext) => Promise<void>
      let snapshot: unknown
      let entryConfig: { maxCollapsedLines: number } | undefined
      extension({
        on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) =>
          events.set(name, handler),
        registerCommand: (
          _name: string,
          value: { handler: (args: string, ctx: ExtensionContext) => Promise<void> },
        ) => {
          command = value.handler
        },
        registerEntryRenderer() {},
        appendEntry: (
          _type: string,
          data: { snapshot: unknown; config: { maxCollapsedLines: number } },
        ) => {
          snapshot = data.snapshot
          entryConfig = data.config
        },
      } as unknown as ExtensionAPI)
      const context = {
        hasUI: true,
        mode: "tui",
        cwd: directory,
        isProjectTrusted: () => true,
        ui: harness,
      } as unknown as ExtensionContext
      events.get("session_start")!({ reason: "startup" }, context)
      harness.setWidget("native", ["native"])
      harness.setWidget("second", ["second"])
      harness.setWidget("first", ["first"])
      expect(renderHost(harness)).toEqual([" first", " second"])
      writeFileSync(path, JSON.stringify({ aboveEditor: { order: ["second", "native", "first"] } }))
      await command!("reload", context)
      expect(renderHost(harness)).toEqual([" second", " native", " first"])
      expect(harness.widgets.has("native")).toBe(false)
      await command!("status", context)
      expect((snapshot as { sections: { order: string[] }[] }).sections[0]?.order).toEqual([
        "second",
        "native",
        "first",
      ])
      const previousSnapshot = snapshot
      const previousHost = managedHost(harness)
      for (const invalid of ["{", JSON.stringify({ aboveEditor: { order: [42] } }), null]) {
        rmSync(path)
        if (invalid === null) mkdirSync(path)
        else writeFileSync(path, invalid)
        harness.notifications.length = 0
        await command!("reload", context)
        expect(managedHost(harness)).toBe(previousHost)
        expect(renderHost(harness)).toEqual([" second", " native", " first"])
        await command!("status", context)
        expect(snapshot).toEqual(previousSnapshot)
        expect(harness.notifications.length).toBeGreaterThan(0)
        expect(harness.notifications).not.toContain("Widget layout reloaded")
        if (invalid === null) rmSync(path, { recursive: true })
      }
      writeFileSync(path, JSON.stringify({ aboveEditor: { order: ["first", "second", "native"] } }))
      harness.notifications.length = 0
      await command!("reload", context)
      expect(renderHost(harness)).toEqual([" first", " second", " native"])
      expect(harness.notifications).toContain("Widget layout reloaded")
      const stableHost = managedHost(harness)
      const mounts = harness.hostMounts
      writeFileSync(
        path,
        JSON.stringify({
          status: { maxCollapsedLines: 20 },
          aboveEditor: { order: ["first", "second", "native"] },
        }),
      )
      await command!("reload", context)
      await command!("status", context)
      expect(managedHost(harness)).toBe(stableHost)
      expect(harness.hostMounts).toBe(mounts)
      expect(entryConfig?.maxCollapsedLines).toBe(20)
      events.get("session_shutdown")!({ reason: "reload" }, context)
      for (const widget of harness.widgets.values()) widget.component?.dispose?.()
      harness.widgets.clear() // Pi /reload clears extension widgets before session_start.
      events.get("session_start")!({ reason: "reload" }, context)
      harness.setWidget("native", ["native"])
      harness.setWidget("second", ["second"])
      harness.setWidget("first", ["first"])
      expect(renderHost(harness)).toEqual([" first", " second", " native"])
      events.get("session_shutdown")!({}, context)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
