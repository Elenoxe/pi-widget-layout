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
