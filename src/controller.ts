import type { ExtensionWidgetOptions } from "@earendil-works/pi-coding-agent"

import { compileOrder, type CompiledOrder } from "./matcher.ts"
import { ManagedWidgetHost } from "./widget-host.ts"
import { routeWidget } from "./routing.ts"
import { WidgetRegistry } from "./registry.ts"
import type {
  WidgetContent,
  WidgetFactory,
  WidgetLayoutConfig,
  WidgetLayoutSnapshot,
  WidgetPlacement,
  WidgetSnapshot,
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
  layout: Set<string>
  host?: ManagedWidgetHost
}

interface ObservedWidget {
  key: string
  active: boolean
  lastSeen: number
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
  private lastSeen = 0
  private readonly owners = new Map<string, WidgetPlacement>()

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
        layout: new Set(),
      },
      belowEditor: {
        compiledOrder: compileOrder(config.belowEditor.order),
        registry: new WidgetRegistry(),
        observations: new Map(),
        layout: new Set(),
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
      section.layout.clear()
    }
    if (this.ui.setWidget === this.wrappedSetWidget) {
      this.ui.setWidget = this.previousSetWidget
    }
    this.installed = false
    this.owners.clear()
  }

  getSnapshot(): WidgetLayoutSnapshot {
    return {
      sections: PLACEMENTS.map((placement) => {
        const section = this.sections[placement]
        const managed: WidgetSnapshot[] = section.registry
          .getRecords()
          .filter(({ key }) => this.owners.get(key) === placement && !section.observations.has(key))
          .map(({ key, active, route }) => ({
            key,
            active,
            resolution:
              route.bucket.kind === "selector"
                ? { kind: "selector", selector: route.bucket.selector }
                : { kind: "system", value: route.bucket.position },
          }))
        const widgets: WidgetSnapshot[] = []
        for (const key of section.layout) {
          if (key === HOST_WIDGET_KEYS[placement]) {
            widgets.push(...managed)
          } else {
            widgets.push({ key, active: true, resolution: { kind: "system", value: "native" } })
          }
        }
        return {
          placement,
          unlisted: this.config[placement].unlisted,
          order: [...this.config[placement].order],
          widgets,
          detached: [...section.observations.values()]
            .filter((widget) => !widget.active)
            .sort((a, b) => b.lastSeen - a.lastSeen)
            .map(({ key, lastSeen }) => ({ key, lastSeen })),
        }
      }),
    }
  }

  private handleSetWidget(
    key: string,
    content: WidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    if (content === undefined) {
      // Pi clears a key in both regions, regardless of the supplied placement.
      for (const placement of PLACEMENTS) this.clearWidget(placement, key, true)
      this.forwardToPreviousSetWidget(key, undefined, options)
      return
    }

    const placement = options?.placement ?? "aboveEditor"
    const otherPlacement = placement === "aboveEditor" ? "belowEditor" : "aboveEditor"
    this.clearWidget(otherPlacement, key)
    this.sections[otherPlacement].observations.delete(key)
    this.owners.set(key, placement)

    const section = this.sections[placement]
    const route = routeWidget(key, placement, this.config, section.compiledOrder)
    if (route.kind === "managed") {
      section.observations.delete(key)
      this.forwardToPreviousSetWidget(key, undefined, options)
      section.registry.set(key, content, route)
      this.syncHost(placement)
    } else {
      this.clearWidget(placement, key)
      this.forwardToPreviousSetWidget(key, content, options)
      section.observations.set(key, { key, active: true, lastSeen: ++this.lastSeen })
    }
  }

  private clearWidget(placement: WidgetPlacement, key: string, explicit = false): void {
    const section = this.sections[placement]
    const observed = section.observations.get(key)
    if (observed !== undefined && (observed.active || explicit)) {
      observed.active = false
      observed.lastSeen = ++this.lastSeen
    }
    if (section.registry.get(key)?.active) {
      section.registry.clear(key)
      this.syncHost(placement)
    }
  }

  private forwardToPreviousSetWidget(
    key: string,
    content: WidgetContent | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    if (typeof content === "function") {
      this.callPreviousSetWidget(key, content, options)
    } else {
      this.callPreviousSetWidget(key, content, options)
    }
    // Pi deletes from both maps before inserting, including on native updates.
    // An absent host keeps only its logical history slot until it mounts again.
    for (const placement of PLACEMENTS) {
      if (content !== undefined || key !== HOST_WIDGET_KEYS[placement]) {
        this.sections[placement].layout.delete(key)
      }
    }
    if (content !== undefined) {
      this.sections[options?.placement ?? "aboveEditor"].layout.add(key)
    }
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
