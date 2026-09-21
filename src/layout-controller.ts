import type { ExtensionWidgetOptions } from "@earendil-works/pi-coding-agent"

import { compileOrder } from "./matcher.ts"
import { ManagedWidgetRoot } from "./managed-root.ts"
import { routeWidget } from "./layout.ts"
import { WidgetRegistry } from "./registry.ts"
import type { ManagedWidgetContent, ManagedWidgetFactory, WidgetLayoutConfig } from "./types.ts"

export const MANAGED_WIDGET_KEY = "pi-widget-layout:managed-root"

export interface WidgetSetHandler {
  (key: string, content: string[] | undefined, options?: ExtensionWidgetOptions): void
  (key: string, content: ManagedWidgetFactory | undefined, options?: ExtensionWidgetOptions): void
}

export interface WidgetLayoutUI {
  setWidget: WidgetSetHandler
}

export class WidgetLayoutController {
  private readonly originalSetWidget: WidgetSetHandler
  private readonly boundOriginalSetWidget: WidgetSetHandler
  private readonly interceptedSetWidget: WidgetSetHandler
  private readonly compiledOrder
  private readonly registry = new WidgetRegistry<ManagedWidgetContent>()
  private rootMounted = false
  private installed = false

  constructor(
    private readonly ui: WidgetLayoutUI,
    private readonly config: WidgetLayoutConfig,
  ) {
    this.originalSetWidget = ui.setWidget
    this.boundOriginalSetWidget = ui.setWidget.bind(ui)
    this.interceptedSetWidget = (key, content, options) => {
      this.handleSetWidget(key, content, options)
    }
    this.compiledOrder = compileOrder(config.aboveEditor.order)
  }

  install(): void {
    if (this.installed) {
      return
    }

    this.ui.setWidget = this.interceptedSetWidget
    this.installed = true
  }

  dispose(): void {
    if (this.rootMounted) {
      this.callOriginalSetWidget(MANAGED_WIDGET_KEY, undefined)
      this.rootMounted = false
    }

    this.registry.reset()
    if (this.ui.setWidget === this.interceptedSetWidget) {
      this.ui.setWidget = this.originalSetWidget
    }
    this.installed = false
  }

  private handleSetWidget(
    key: string,
    content: ManagedWidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    const requestedPlacement = options?.placement ?? "aboveEditor"
    const route = routeWidget(key, requestedPlacement, this.config, this.compiledOrder)

    if (route.kind === "managed") {
      this.callOriginalSetWidget(key, undefined, options)
      if (content === undefined) {
        this.registry.set(key, undefined, route)
      } else {
        this.registry.set(key, content, route)
      }
      this.refreshManagedRoot()
      return
    }

    this.registry.clear(key)
    this.refreshManagedRoot()
    this.callOriginalSetWidget(key, content, options)
  }
  private callOriginalSetWidget(
    key: string,
    content: ManagedWidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    if (typeof content === "function") {
      this.boundOriginalSetWidget(key, content, options)
      return
    }

    this.boundOriginalSetWidget(key, content, options)
  }
  private refreshManagedRoot(): void {
    const records = this.registry.getActiveRecords()
    if (records.length === 0) {
      if (this.rootMounted) {
        this.callOriginalSetWidget(MANAGED_WIDGET_KEY, undefined)
        this.rootMounted = false
      }
      return
    }

    this.callOriginalSetWidget(
      MANAGED_WIDGET_KEY,
      (tui, theme) => new ManagedWidgetRoot(records, tui, theme),
      { placement: "aboveEditor" },
    )
    this.rootMounted = true
  }
}
