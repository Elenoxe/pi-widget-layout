import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

export type WidgetPlacement = "aboveEditor" | "belowEditor"

export type UnlistedPolicy = "native" | "above" | "below"

export interface AboveEditorConfig {
  unlisted: UnlistedPolicy
  order: string[]
}

export interface WidgetLayoutConfig {
  aboveEditor: AboveEditorConfig
}

export interface ConfigDiagnostic {
  code: string
  message: string
}

export type WidgetComponent = Component & { dispose?(): void }

export type WidgetFactory = (tui: TUI, theme: Theme) => WidgetComponent

export type WidgetContent = string[] | WidgetFactory
