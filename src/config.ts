import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import type { ConfigDiagnostic, UnlistedPolicy, WidgetLayoutConfig } from "./types.ts"

export interface ConfigParseResult {
  config: WidgetLayoutConfig
  diagnostics: ConfigDiagnostic[]
}

export type ConfigLoadResult = ConfigParseResult

export const DEFAULT_CONFIG_PATH = join(homedir(), ".pi", "agent", "widget-layout.json")

export function createDefaultConfig(): WidgetLayoutConfig {
  return {
    aboveEditor: {
      unlisted: "native",
      order: [],
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function diagnostic(code: string, message: string): ConfigDiagnostic {
  return { code, message }
}

function isUnlistedPolicy(value: unknown): value is UnlistedPolicy {
  return value === "native" || value === "above" || value === "below"
}

export function parseWidgetLayoutConfig(value: unknown): ConfigParseResult {
  const config = createDefaultConfig()
  const diagnostics: ConfigDiagnostic[] = []

  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic("invalid-root", "Widget layout configuration root must be an object."),
    )
    return { config, diagnostics }
  }

  if (!Object.hasOwn(value, "aboveEditor")) {
    return { config, diagnostics }
  }

  const aboveEditorValue = value.aboveEditor
  if (!isRecord(aboveEditorValue)) {
    diagnostics.push(
      diagnostic("invalid-above-editor", "The aboveEditor configuration must be an object."),
    )
    return { config, diagnostics }
  }

  if (Object.hasOwn(aboveEditorValue, "unlisted")) {
    const unlistedValue = aboveEditorValue.unlisted
    if (isUnlistedPolicy(unlistedValue)) {
      config.aboveEditor.unlisted = unlistedValue
    } else {
      diagnostics.push(
        diagnostic(
          "invalid-unlisted",
          'aboveEditor.unlisted must be one of "native", "above", or "below".',
        ),
      )
    }
  }

  if (Object.hasOwn(aboveEditorValue, "order")) {
    const orderValue = aboveEditorValue.order
    if (!Array.isArray(orderValue)) {
      diagnostics.push(diagnostic("invalid-order", "aboveEditor.order must be an array."))
    } else {
      const seen = new Set<string>()
      for (const [index, item] of orderValue.entries()) {
        if (typeof item !== "string") {
          diagnostics.push(
            diagnostic(
              "invalid-selector",
              `aboveEditor.order[${index}] must be a non-empty string.`,
            ),
          )
          continue
        }

        const selector = item.trim()
        if (selector.length === 0) {
          diagnostics.push(
            diagnostic(
              "invalid-selector",
              `aboveEditor.order[${index}] must be a non-empty string.`,
            ),
          )
          continue
        }

        if (seen.has(selector)) {
          diagnostics.push(
            diagnostic(
              "duplicate-selector",
              `aboveEditor.order contains duplicate selector "${selector}".`,
            ),
          )
          continue
        }

        seen.add(selector)
        config.aboveEditor.order.push(selector)
      }
    }
  }

  return { config, diagnostics }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  )
}

export function loadWidgetLayoutConfig(filePath = DEFAULT_CONFIG_PATH): ConfigLoadResult {
  let text: string
  try {
    text = readFileSync(filePath, "utf8")
  } catch (error) {
    if (isMissingFileError(error)) {
      return { config: createDefaultConfig(), diagnostics: [] }
    }

    return {
      config: createDefaultConfig(),
      diagnostics: [
        diagnostic("read-error", `Unable to read widget layout configuration at ${filePath}.`),
      ],
    }
  }

  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    return {
      config: createDefaultConfig(),
      diagnostics: [
        diagnostic("invalid-json", `Widget layout configuration at ${filePath} is not valid JSON.`),
      ],
    }
  }

  return parseWidgetLayoutConfig(value)
}
