import type { Component, TUI } from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"

export type WidgetPlacement = "aboveEditor" | "belowEditor"

export type UnlistedPolicy = "native" | "above" | "below"

export interface AboveEditorConfig {
  order: string[]
  unlisted: UnlistedPolicy
}

export interface WidgetLayoutConfig {
  aboveEditor: AboveEditorConfig
}

export interface ConfigDiagnostic {
  code: string
  message: string
}

export type ManagedWidgetComponent = Component & { dispose?(): void }

export type ManagedWidgetFactory = (tui: TUI, theme: Theme) => ManagedWidgetComponent

export type ManagedWidgetContent = string[] | ManagedWidgetFactory
