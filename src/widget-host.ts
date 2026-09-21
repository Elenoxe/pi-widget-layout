import { Container, Text, type TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import type { WidgetRecord } from "./registry.ts"
import type { WidgetComponent, WidgetContent } from "./types.ts"

const MAX_WIDGET_LINES = 10

interface CachedWidget {
  revision: number
  component: WidgetComponent
}

export class ManagedWidgetHost extends Container {
  private readonly cachedWidgets = new Map<string, CachedWidget>()
  private readonly tui: TUI
  private readonly theme: Theme

  constructor(records: readonly WidgetRecord<WidgetContent>[], tui: TUI, theme: Theme) {
    super()
    this.tui = tui
    this.theme = theme
    this.reconcile(records)
  }

  update(records: readonly WidgetRecord<WidgetContent>[]): void {
    this.reconcile(records)
    this.tui.requestRender()
  }

  dispose(): void {
    for (const widget of this.cachedWidgets.values()) {
      widget.component.dispose?.()
    }

    this.cachedWidgets.clear()
    this.clear()
  }

  private reconcile(records: readonly WidgetRecord<WidgetContent>[]): void {
    const nextWidgets = new Map<string, CachedWidget>()
    const nextChildren: WidgetComponent[] = []

    for (const record of records) {
      if (record.content === undefined) {
        continue
      }

      const cached = this.cachedWidgets.get(record.key)
      if (cached !== undefined && cached.revision === record.revision) {
        nextWidgets.set(record.key, cached)
        nextChildren.push(cached.component)
        continue
      }

      cached?.component.dispose?.()
      const component = this.createComponent(record.content)
      nextWidgets.set(record.key, { revision: record.revision, component })
      nextChildren.push(component)
    }

    for (const [key, cached] of this.cachedWidgets) {
      if (!nextWidgets.has(key)) {
        cached.component.dispose?.()
      }
    }

    this.cachedWidgets.clear()
    for (const [key, cached] of nextWidgets) {
      this.cachedWidgets.set(key, cached)
    }

    this.clear()
    for (const child of nextChildren) {
      this.addChild(child)
    }
  }

  private createComponent(content: WidgetContent): WidgetComponent {
    if (typeof content === "function") {
      return content(this.tui, this.theme)
    }

    const container = new Container()
    for (const line of content.slice(0, MAX_WIDGET_LINES)) {
      container.addChild(new Text(line, 1, 0))
    }

    if (content.length > MAX_WIDGET_LINES) {
      container.addChild(new Text(this.theme.fg("muted", "... (widget truncated)"), 1, 0))
    }

    return container
  }
}
