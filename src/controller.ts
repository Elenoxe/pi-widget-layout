import type { ExtensionWidgetOptions } from "@earendil-works/pi-coding-agent"

import { compileOrder } from "./matcher.ts"
import { ManagedWidgetHost } from "./widget-host.ts"
import { routeWidget } from "./routing.ts"
import type { WidgetRoute } from "./routing.ts"
import { WidgetRegistry } from "./registry.ts"
import type {
  WidgetContent,
  WidgetFactory,
  WidgetLayoutConfig,
  WidgetLayoutSnapshot,
  WidgetPlacement,
  WidgetResolution,
} from "./types.ts"

export const HOST_WIDGET_KEY = "pi-widget-layout:host"

interface ObservedWidget {
  key: string
  firstObserved: number
  active: boolean
  resolution: WidgetResolution
}
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
  private readonly observedWidgets = new Map<string, ObservedWidget>()
  private nextObserved = 0
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

    this.observedWidgets.clear()
    this.nextObserved = 0
    this.registry.reset()
    if (this.ui.setWidget === this.wrappedSetWidget) {
      this.ui.setWidget = this.previousSetWidget
    }
    this.installed = false
  }

  getSnapshot(): WidgetLayoutSnapshot {
    const widgets = [...this.observedWidgets.values()]
      .filter((widget) => widget.active)
      .sort((left, right) => left.firstObserved - right.firstObserved)
      .map(({ key, resolution }) => ({
        key,
        resolution: { ...resolution },
      }))

    return {
      sections: [
        {
          placement: "aboveEditor",
          unlisted: this.config.aboveEditor.unlisted,
          order: [...this.config.aboveEditor.order],
          widgets,
        },
      ],
    }
  }
  private handleSetWidget(
    key: string,
    content: WidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    const requestedPlacement = options?.placement ?? "aboveEditor"
    const route = routeWidget(key, requestedPlacement, this.config, this.compiledOrder)

    this.updateObservation(key, content, requestedPlacement, route)
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

  private updateObservation(
    key: string,
    content: WidgetContent | undefined,
    requestedPlacement: WidgetPlacement,
    route: WidgetRoute,
  ): void {
    const observed = this.observedWidgets.get(key)
    if (content === undefined) {
      if (observed !== undefined) {
        observed.active = false
      }
      return
    }

    const current = observed ?? {
      key,
      firstObserved: this.nextObserved++,
      active: false,
      resolution: { kind: "system", value: "native" } as WidgetResolution,
    }
    this.observedWidgets.set(key, current)
    current.active = false

    if (requestedPlacement === "belowEditor") {
      return
    }

    if (route.kind === "managed") {
      current.resolution =
        route.bucket.kind === "selector"
          ? { kind: "selector", selector: route.bucket.selector }
          : { kind: "system", value: "above" }
    } else {
      current.resolution =
        route.placement === "belowEditor"
          ? { kind: "system", value: "belowEditor" }
          : { kind: "system", value: "native" }
    }
    current.active = true
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
