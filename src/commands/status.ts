import type {
  CustomEntry,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent"
import {
  Text,
  type Component,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  visibleWidth,
} from "@earendil-works/pi-tui"

import { createDefaultConfig } from "../config.ts"
import type { WidgetLayoutCommandRuntime } from "./registry.ts"
import type {
  StatusConfig,
  WidgetLayoutSectionSnapshot,
  WidgetLayoutSnapshot,
  WidgetResolution,
} from "../types.ts"

import { WidgetLayoutCommandRegistry } from "./registry.ts"

export const STATUS_ENTRY_TYPE = "pi-widget-layout:status"

export interface StatusEntryData {
  readonly snapshot: WidgetLayoutSnapshot
  readonly config: StatusConfig
}

export interface StatusLine {
  readonly text: string
  readonly collapsible: boolean
}

export function formatResolution(resolution: WidgetResolution): string {
  switch (resolution.kind) {
    case "selector":
      return resolution.selector
    case "system":
      return `[${resolution.value}]`
  }
}

export function formatStatusSection(
  section: WidgetLayoutSectionSnapshot,
  config: StatusConfig,
): StatusLine[] {
  const lines: StatusLine[] = [
    {
      text: `${section.placement}  unlisted=[${section.unlisted}]`,
      collapsible: false,
    },
    {
      text: `  order: ${section.order.length === 0 ? "—" : section.order.join(" > ")}`,
      collapsible: false,
    },
    { text: "", collapsible: false },
  ]

  if (section.widgets.length === 0) {
    lines.push({ text: "  widgets: —", collapsible: false })
    return lines
  }

  const keyWidth = Math.min(
    config.keyColumnMaxWidth,
    Math.max(...section.widgets.map((widget) => visibleWidth(widget.key))),
  )
  for (const widget of section.widgets) {
    const padding = Math.max(0, keyWidth - visibleWidth(widget.key))
    lines.push({
      text: `  ${widget.key}${" ".repeat(padding)} → ${formatResolution(widget.resolution)}`,
      collapsible: true,
    })
  }
  return lines
}

export function formatStatus(snapshot: WidgetLayoutSnapshot, config: StatusConfig): StatusLine[] {
  const lines: StatusLine[] = [
    { text: "widget-layout", collapsible: false },
    { text: "", collapsible: false },
  ]

  snapshot.sections.forEach((section, index) => {
    if (index > 0) {
      lines.push({ text: "", collapsible: false })
    }
    lines.push(...formatStatusSection(section, config))
  })

  return lines
}

function renderPlain(lines: readonly StatusLine[], width: number): string[] {
  return new Text(lines.map((line) => line.text).join("\n"), 1, 0).render(Math.max(1, width))
}

function buildCollapsedLines(
  lines: readonly StatusLine[],
  visibleWidgetCount: number,
): StatusLine[] {
  const totalWidgetCount = lines.filter((line) => line.collapsible).length
  const result: StatusLine[] = []
  let shownWidgetCount = 0

  for (const line of lines) {
    if (!line.collapsible) {
      result.push(line)
      continue
    }
    if (shownWidgetCount < visibleWidgetCount) {
      result.push(line)
      shownWidgetCount += 1
    }
  }

  const hiddenWidgetCount = totalWidgetCount - visibleWidgetCount
  if (hiddenWidgetCount > 0) {
    result.push({ text: `  … ${hiddenWidgetCount} more`, collapsible: false })
  }
  return result
}

export class WidgetLayoutStatusComponent implements Component {
  private lastRenderWasCollapsible = false

  constructor(
    private readonly lines: readonly StatusLine[],
    private expanded: boolean,
    private readonly theme: Theme,
    private readonly config: StatusConfig,
  ) {}

  render(width: number): string[] {
    const fullRendered = renderPlain(this.lines, width)
    const hasWidgets = this.lines.some((line) => line.collapsible)
    this.lastRenderWasCollapsible =
      hasWidgets && fullRendered.length > this.config.maxCollapsedLines

    if (!this.lastRenderWasCollapsible || this.expanded) {
      return this.renderStyled(this.lines, width)
    }

    const totalWidgetCount = this.lines.filter((line) => line.collapsible).length
    for (
      let visibleWidgetCount = totalWidgetCount;
      visibleWidgetCount >= 0;
      visibleWidgetCount -= 1
    ) {
      const candidate = buildCollapsedLines(this.lines, visibleWidgetCount)
      if (renderPlain(candidate, width).length <= this.config.maxCollapsedLines) {
        return this.renderStyled(candidate, width)
      }
    }

    return this.renderStyled(buildCollapsedLines(this.lines, 0), width)
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left" || !this.lastRenderWasCollapsible) {
      return undefined
    }

    this.expanded = !this.expanded
    return { handled: true, render: true }
  }

  invalidate(): void {}

  private renderStyled(lines: readonly StatusLine[], width: number): string[] {
    const text = lines
      .map((line, index) => (index === 0 ? this.theme.fg("accent", line.text) : line.text))
      .join("\n")
    return new Text(text, 1, 0).render(Math.max(1, width))
  }
}

export function renderStatusEntry(
  entry: CustomEntry<StatusEntryData>,
  options: { expanded: boolean },
  theme: Theme,
): Component {
  const data = entry.data ?? {
    snapshot: { sections: [] },
    config: createDefaultConfig().status,
  }
  return new WidgetLayoutStatusComponent(
    formatStatus(data.snapshot, data.config),
    options.expanded,
    theme,
    data.config,
  )
}

export function registerStatusRenderer(pi: Pick<ExtensionAPI, "registerEntryRenderer">): void {
  pi.registerEntryRenderer(STATUS_ENTRY_TYPE, renderStatusEntry)
}

export function runStatusCommand(pi: ExtensionAPI, runtime: WidgetLayoutCommandRuntime): void {
  pi.appendEntry(STATUS_ENTRY_TYPE, {
    snapshot: runtime.controller.getSnapshot(),
    config: { ...runtime.config.status },
  } satisfies StatusEntryData)
}

export interface StatusCommandDependencies {
  readonly pi: ExtensionAPI
  readonly getRuntime: () => WidgetLayoutCommandRuntime | undefined
}

export function registerStatusCommand(
  registry: WidgetLayoutCommandRegistry,
  dependencies: StatusCommandDependencies,
): void {
  registerStatusRenderer(dependencies.pi)
  registry.register(
    {
      name: "status",
      description: "Show current widget layout",
      run: (_args: string, ctx: ExtensionContext) => {
        if (!ctx.hasUI || ctx.mode !== "tui") {
          return
        }

        const runtime = dependencies.getRuntime()
        if (runtime === undefined) {
          return
        }
        runStatusCommand(dependencies.pi, runtime)
      },
    },
    { default: true },
  )
}
