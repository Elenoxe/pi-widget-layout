import { Container, Text, type TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

import type { WidgetRecord } from "./registry.ts"
import type { ManagedWidgetComponent, ManagedWidgetContent } from "./types.ts"

const MAX_WIDGET_LINES = 10

export class ManagedWidgetRoot extends Container {
  private readonly widgets: ManagedWidgetComponent[] = []

  constructor(records: readonly WidgetRecord<ManagedWidgetContent>[], tui: TUI, theme: Theme) {
    super()

    for (const record of records) {
      if (record.content === undefined) {
        continue
      }

      const component = this.createComponent(record.content, tui, theme)
      this.widgets.push(component)
      this.addChild(component)
    }
  }

  dispose(): void {
    for (const widget of this.widgets) {
      widget.dispose?.()
    }

    this.widgets.length = 0
    this.clear()
  }

  private createComponent(
    content: ManagedWidgetContent,
    tui: TUI,
    theme: Theme,
  ): ManagedWidgetComponent {
    if (typeof content === "function") {
      return content(tui, theme)
    }

    const container = new Container()
    for (const line of content.slice(0, MAX_WIDGET_LINES)) {
      container.addChild(new Text(line, 1, 0))
    }

    if (content.length > MAX_WIDGET_LINES) {
      container.addChild(new Text(theme.fg("muted", "... (widget truncated)"), 1, 0))
    }

    return container
  }
}
