import type { ExtensionWidgetOptions } from "@earendil-works/pi-coding-agent"

import { compileOrder } from "./matcher.ts"
import { ManagedWidgetHost } from "./widget-host.ts"
import { routeWidget } from "./routing.ts"
import { WidgetRegistry } from "./registry.ts"
import type { WidgetContent, WidgetFactory, WidgetLayoutConfig } from "./types.ts"

export const HOST_WIDGET_KEY = "pi-widget-layout:host"

export interface WidgetSetHandler {
  (key: string, content: string[] | undefined, options?: ExtensionWidgetOptions): void
  (key: string, content: WidgetFactory | undefined, options?: ExtensionWidgetOptions): void
}

export interface WidgetLayoutUI {
  setWidget: WidgetSetHandler
}

export class WidgetLayoutController {
  private readonly previousSetWidget: WidgetSetHandler
  private readonly callPreviousSetWidget: WidgetSetHandler
  private readonly wrappedSetWidget: WidgetSetHandler
  private readonly compiledOrder
  private readonly registry = new WidgetRegistry<WidgetContent>()
  private host?: ManagedWidgetHost
  private installed = false

  constructor(
    private readonly ui: WidgetLayoutUI,
    private readonly config: WidgetLayoutConfig,
  ) {
    this.previousSetWidget = ui.setWidget
    this.callPreviousSetWidget = ui.setWidget.bind(ui)
    this.wrappedSetWidget = (key, content, options) => {
      if (!this.installed) {
        this.forwardToPreviousSetWidget(key, content, options)
        return
      }

      this.handleSetWidget(key, content, options)
    }
    this.compiledOrder = compileOrder(config.aboveEditor.order)
  }

  install(): void {
    if (this.installed) {
      return
    }

    this.ui.setWidget = this.wrappedSetWidget
    this.installed = true
  }

  dispose(): void {
    const host = this.host
    this.host = undefined
    if (host !== undefined) {
      this.forwardToPreviousSetWidget(HOST_WIDGET_KEY, undefined)
    }

    this.registry.reset()
    if (this.ui.setWidget === this.wrappedSetWidget) {
      this.ui.setWidget = this.previousSetWidget
    }
    this.installed = false
  }

  private handleSetWidget(
    key: string,
    content: WidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    const requestedPlacement = options?.placement ?? "aboveEditor"
    const route = routeWidget(key, requestedPlacement, this.config, this.compiledOrder)

    if (route.kind === "managed") {
      this.forwardToPreviousSetWidget(key, undefined, options)
      if (content === undefined) {
        this.registry.set(key, undefined, route)
      } else {
        this.registry.set(key, content, route)
      }
      this.syncHost()
      return
    }

    this.registry.clear(key)
    this.syncHost()
    const nativeOptions =
      route.placement === requestedPlacement ? options : { ...options, placement: route.placement }
    this.forwardToPreviousSetWidget(key, content, nativeOptions)
  }

  private forwardToPreviousSetWidget(
    key: string,
    content: WidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    if (typeof content === "function") {
      this.callPreviousSetWidget(key, content, options)
      return
    }

    this.callPreviousSetWidget(key, content, options)
  }

  private syncHost(): void {
    const records = this.registry.getActiveRecords()
    if (records.length === 0) {
      if (this.host !== undefined) {
        this.host = undefined
        this.forwardToPreviousSetWidget(HOST_WIDGET_KEY, undefined)
      }
      return
    }

    if (this.host !== undefined) {
      this.host.update(records)
      return
    }

    this.forwardToPreviousSetWidget(
      HOST_WIDGET_KEY,
      (tui, theme) => {
        const host = new ManagedWidgetHost(records, tui, theme)
        this.host = host
        return host
      },
      { placement: "aboveEditor" },
    )
  }
}
