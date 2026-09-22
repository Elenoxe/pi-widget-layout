import type { ExtensionWidgetOptions } from "@earendil-works/pi-coding-agent"

import { compileOrder, type CompiledOrder } from "./matcher.ts"
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

export const HOST_WIDGET_KEYS = {
  aboveEditor: "pi-widget-layout:host:aboveEditor",
  belowEditor: "pi-widget-layout:host:belowEditor",
} as const

const PLACEMENTS = ["aboveEditor", "belowEditor"] as const

interface SectionState {
  compiledOrder: CompiledOrder
  registry: WidgetRegistry<WidgetContent>
  observations: Map<string, ObservedWidget>
  host?: ManagedWidgetHost
}

interface ObservedWidget {
  key: string
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
  private readonly sections: Record<WidgetPlacement, SectionState>
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
    this.sections = {
      aboveEditor: {
        compiledOrder: compileOrder(config.aboveEditor.order),
        registry: new WidgetRegistry(),
        observations: new Map(),
      },
      belowEditor: {
        compiledOrder: compileOrder(config.belowEditor.order),
        registry: new WidgetRegistry(),
        observations: new Map(),
      },
    }
  }

  install(): void {
    if (this.installed) return
    this.ui.setWidget = this.wrappedSetWidget
    this.installed = true
  }

  dispose(): void {
    for (const placement of PLACEMENTS) {
      const section = this.sections[placement]
      if (section.host !== undefined) {
        section.host = undefined
        this.forwardToPreviousSetWidget(HOST_WIDGET_KEYS[placement], undefined)
      }
      section.observations.clear()
      section.registry.reset()
    }
    if (this.ui.setWidget === this.wrappedSetWidget) {
      this.ui.setWidget = this.previousSetWidget
    }
    this.installed = false
  }

  getSnapshot(): WidgetLayoutSnapshot {
    return {
      sections: PLACEMENTS.map((placement) => ({
        placement,
        unlisted: this.config[placement].unlisted,
        order: [...this.config[placement].order],
        widgets: [...this.sections[placement].observations.values()]
          .filter((widget) => widget.active)
          .map(({ key, resolution }) => ({ key, resolution: { ...resolution } })),
      })),
    }
  }

  private handleSetWidget(
    key: string,
    content: WidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    if (content === undefined) {
      // Pi clears a key in both regions, regardless of the supplied placement.
      for (const placement of PLACEMENTS) this.clearWidget(placement, key)
      this.forwardToPreviousSetWidget(key, undefined, options)
      return
    }

    const placement = options?.placement ?? "aboveEditor"
    const otherPlacement = placement === "aboveEditor" ? "belowEditor" : "aboveEditor"
    this.clearWidget(otherPlacement, key)

    const section = this.sections[placement]
    const route = routeWidget(key, placement, this.config, section.compiledOrder)
    if (route.kind === "managed") {
      this.forwardToPreviousSetWidget(key, undefined, options)
      section.registry.set(key, content, route)
      this.syncHost(placement)
    } else {
      this.clearWidget(placement, key)
      this.forwardToPreviousSetWidget(key, content, options)
    }
    this.updateObservation(key, route)
  }

  private clearWidget(placement: WidgetPlacement, key: string): void {
    const section = this.sections[placement]
    const observed = section.observations.get(key)
    if (observed !== undefined) observed.active = false
    if (section.registry.get(key)?.active) {
      section.registry.clear(key)
      this.syncHost(placement)
    }
  }

  private updateObservation(key: string, route: WidgetRoute): void {
    const observations = this.sections[route.placement].observations
    const resolution: WidgetResolution =
      route.kind === "managed"
        ? route.bucket.kind === "selector"
          ? { kind: "selector", selector: route.bucket.selector }
          : { kind: "system", value: route.bucket.position }
        : { kind: "system", value: "native" }
    // Updating an existing Map entry preserves its first-seen slot in this region.
    observations.set(key, { key, active: true, resolution })
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

  private syncHost(placement: WidgetPlacement): void {
    const section = this.sections[placement]
    const records = section.registry.getActiveRecords()
    if (records.length === 0) {
      if (section.host !== undefined) {
        section.host = undefined
        this.forwardToPreviousSetWidget(HOST_WIDGET_KEYS[placement], undefined)
      }
      return
    }
    if (section.host !== undefined) {
      section.host.update(records)
      return
    }
    this.forwardToPreviousSetWidget(
      HOST_WIDGET_KEYS[placement],
      (tui, theme) => {
        const host = new ManagedWidgetHost(records, tui, theme)
        section.host = host
        return host
      },
      { placement },
    )
  }
}
