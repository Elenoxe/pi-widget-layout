import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

export type WidgetPlacement = "aboveEditor" | "belowEditor"

export type UnlistedPolicy = "native" | "above" | "below"

export interface StatusConfig {
  keyColumnMaxWidth: number
  maxCollapsedLines: number
}

export interface WidgetSectionConfig {
  unlisted: UnlistedPolicy
  order: string[]
}

export interface WidgetLayoutConfig {
  status: StatusConfig
  aboveEditor: WidgetSectionConfig
}

export type WidgetResolution =
  { kind: "selector"; selector: string } | { kind: "system"; value: "native" | "above" | "below" }

export interface WidgetSnapshot {
  readonly key: string
  readonly resolution: WidgetResolution
}

export interface WidgetLayoutSectionSnapshot {
  readonly placement: WidgetPlacement
  readonly unlisted: UnlistedPolicy
  readonly order: readonly string[]
  readonly widgets: readonly WidgetSnapshot[]
}

export interface WidgetLayoutSnapshot {
  readonly sections: readonly WidgetLayoutSectionSnapshot[]
}

export interface ConfigDiagnostic {
  code: string
  message: string
}

export type WidgetComponent = Component & { dispose?(): void }

export type WidgetFactory = (tui: TUI, theme: Theme) => WidgetComponent

export type WidgetContent = string[] | WidgetFactory
