import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent"

import type {
  ConfigDiagnostic,
  UnlistedPolicy,
  WidgetLayoutConfig,
  WidgetPlacement,
  WidgetSectionConfig,
} from "./types.ts"

export interface ConfigParseResult {
  config: WidgetLayoutConfig
  diagnostics: ConfigDiagnostic[]
}

export type ConfigLoadResult = ConfigParseResult

export interface WidgetLayoutConfigLoadOptions {
  readonly cwd: string
  readonly projectTrusted: boolean
}

const DEFAULT_CONFIG_PATH = join(getAgentDir(), "widget-layout.json")

function getProjectConfigPath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, "widget-layout.json")
}

export function createDefaultConfig(): WidgetLayoutConfig {
  return {
    status: {
      keyColumnMaxWidth: 24,
      maxCollapsedLines: 12,
    },
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

export function parseWidgetLayoutConfig(
  value: unknown,
  baseConfig: WidgetLayoutConfig = createDefaultConfig(),
): ConfigParseResult {
  const config = structuredClone(baseConfig)
  const diagnostics: ConfigDiagnostic[] = []

  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic("invalid-root", "Widget layout configuration root must be an object."),
    )
    return { config, diagnostics }
  }

  if (Object.hasOwn(value, "status")) {
    const statusValue = value.status
    if (!isRecord(statusValue)) {
      diagnostics.push(diagnostic("invalid-status", "The status configuration must be an object."))
    } else {
      if (Object.hasOwn(statusValue, "keyColumnMaxWidth")) {
        const keyColumnMaxWidth = statusValue.keyColumnMaxWidth
        if (isPositiveInteger(keyColumnMaxWidth)) {
          config.status.keyColumnMaxWidth = keyColumnMaxWidth
        } else {
          diagnostics.push(
            diagnostic(
              "invalid-key-column-max-width",
              "status.keyColumnMaxWidth must be a positive integer.",
            ),
          )
        }
      }

      if (Object.hasOwn(statusValue, "maxCollapsedLines")) {
        const maxCollapsedLines = statusValue.maxCollapsedLines
        if (isPositiveInteger(maxCollapsedLines)) {
          config.status.maxCollapsedLines = maxCollapsedLines
        } else {
          diagnostics.push(
            diagnostic(
              "invalid-max-collapsed-lines",
              "status.maxCollapsedLines must be a positive integer.",
            ),
          )
        }
      }
    }
  }

  if (Object.hasOwn(value, "aboveEditor")) {
    parseSection(value.aboveEditor, config.aboveEditor, "aboveEditor", diagnostics)
  }
  return { config, diagnostics }
}

function parseSection(
  value: unknown,
  config: WidgetSectionConfig,
  placement: WidgetPlacement,
  diagnostics: ConfigDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        placement === "aboveEditor" ? "invalid-above-editor" : "invalid-below-editor",
        `The ${placement} configuration must be an object.`,
      ),
    )
    return
  }

  if (Object.hasOwn(value, "unlisted")) {
    if (isUnlistedPolicy(value.unlisted)) {
      config.unlisted = value.unlisted
    } else {
      diagnostics.push(
        diagnostic(
          "invalid-unlisted",
          `${placement}.unlisted must be one of "native", "above", or "below".`,
        ),
      )
    }
  }

  if (Object.hasOwn(value, "order")) {
    if (!Array.isArray(value.order)) {
      diagnostics.push(diagnostic("invalid-order", `${placement}.order must be an array.`))
    } else {
      const order: string[] = []
      const seen = new Set<string>()
      for (const [index, item] of value.order.entries()) {
        if (typeof item !== "string" || item.trim().length === 0) {
          diagnostics.push(
            diagnostic(
              "invalid-selector",
              `${placement}.order[${index}] must be a non-empty string.`,
            ),
          )
          continue
        }
        const selector = item.trim()
        if (seen.has(selector)) {
          diagnostics.push(
            diagnostic(
              "duplicate-selector",
              `${placement}.order contains duplicate selector "${selector}".`,
            ),
          )
          continue
        }
        seen.add(selector)
        order.push(selector)
      }
      config.order = order
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  )
}

function loadConfigFile(filePath: string, baseConfig: WidgetLayoutConfig): ConfigLoadResult {
  let text: string
  try {
    text = readFileSync(filePath, "utf8")
  } catch (error) {
    if (isMissingFileError(error)) {
      return { config: structuredClone(baseConfig), diagnostics: [] }
    }

    return {
      config: structuredClone(baseConfig),
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
      config: structuredClone(baseConfig),
      diagnostics: [
        diagnostic("invalid-json", `Widget layout configuration at ${filePath} is not valid JSON.`),
      ],
    }
  }

  return parseWidgetLayoutConfig(value, baseConfig)
}

export function loadWidgetLayoutConfig(filePath?: string): ConfigLoadResult
export function loadWidgetLayoutConfig(options: WidgetLayoutConfigLoadOptions): ConfigLoadResult
export function loadWidgetLayoutConfig(
  source: string | WidgetLayoutConfigLoadOptions = DEFAULT_CONFIG_PATH,
): ConfigLoadResult {
  if (typeof source === "string") {
    return loadConfigFile(source, createDefaultConfig())
  }
  const globalResult = loadConfigFile(DEFAULT_CONFIG_PATH, createDefaultConfig())
  if (!source.projectTrusted) {
    return globalResult
  }

  const projectResult = loadConfigFile(getProjectConfigPath(source.cwd), globalResult.config)
  return {
    config: projectResult.config,
    diagnostics: [...globalResult.diagnostics, ...projectResult.diagnostics],
  }
}
