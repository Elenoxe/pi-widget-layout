import { describe, expect, test } from "bun:test"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import type { AutocompleteItem } from "@earendil-works/pi-tui"

import { registerCommands } from "../../src/commands/index.ts"
import type { WidgetLayoutCommandRuntime } from "../../src/commands/registry.ts"
import { STATUS_ENTRY_TYPE } from "../../src/commands/status.ts"
import type { WidgetLayoutSnapshot } from "../../src/types.ts"

interface FakeCommand {
  handler: (args: string, context: ExtensionContext) => Promise<void>
  getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null
}

interface Harness {
  command?: FakeCommand
  rendererType?: string
  appendedEntries: Array<{ customType: string; data: unknown }>
  notifications: Array<{ message: string; type?: "info" | "warning" | "error" }>
  context: ExtensionContext
}

function harness(withRuntime = true): Harness {
  const result: Harness = {
    appendedEntries: [],
    notifications: [],
    context: undefined as unknown as ExtensionContext,
  }
  const ui = {
    notify: (message: string, type?: "info" | "warning" | "error") => {
      result.notifications.push({ message, type })
    },
  }
  result.context = { hasUI: true, mode: "tui", ui } as unknown as ExtensionContext

  const snapshot: WidgetLayoutSnapshot = { sections: [] }
  const runtime = withRuntime
    ? ({
        controller: { getSnapshot: () => snapshot },
        config: {
          status: { keyColumnMaxWidth: 8, maxCollapsedLines: 20 },
          aboveEditor: { unlisted: "native", order: [] },
        },
      } as unknown as WidgetLayoutCommandRuntime)
    : undefined
  const pi = {
    registerCommand(_name: string, command: FakeCommand) {
      result.command = command
    },
    registerEntryRenderer(customType: string, _renderer: unknown) {
      result.rendererType = customType
      return undefined
    },
    appendEntry(customType: string, data: unknown) {
      result.appendedEntries.push({ customType, data })
    },
  }

  registerCommands(pi as unknown as ExtensionAPI, () => runtime)
  return result
}

describe("widget-layout command", () => {
  test("defaults to status and accepts the explicit status subcommand", async () => {
    const result = harness()
    expect(result.rendererType).toBe(STATUS_ENTRY_TYPE)
    await result.command!.handler("", result.context)
    await result.command!.handler("status", result.context)

    expect(result.appendedEntries).toHaveLength(2)
    expect(result.appendedEntries[0]).toEqual(result.appendedEntries[1])
    expect(result.appendedEntries[0]).toEqual({
      customType: STATUS_ENTRY_TYPE,
      data: {
        snapshot: { sections: [] },
        config: {
          keyColumnMaxWidth: 8,
          maxCollapsedLines: 20,
        },
      },
    })
  })

  test("completes status from the subcommand registry", () => {
    const result = harness()
    const completions = result.command?.getArgumentCompletions?.("s")

    expect(completions).toEqual([
      {
        value: "status",
        label: "status",
        description: "Show current widget layout",
      },
    ])
    expect(result.command?.getArgumentCompletions?.("status anything")).toBeNull()
  })

  test("is silent outside TUI mode or without UI", async () => {
    const result = harness()

    await result.command!.handler("unknown", { ...result.context, mode: "rpc" })
    await result.command!.handler("unknown", { ...result.context, hasUI: false })

    expect(result.notifications).toEqual([])
    expect(result.appendedEntries).toHaveLength(0)
  })

  test("is silent when runtime is unavailable", async () => {
    const result = harness(false)

    await result.command!.handler("", result.context)

    expect(result.appendedEntries).toHaveLength(0)
  })
  test("warns with registry-generated usage for an unknown command", async () => {
    const result = harness()

    await result.command!.handler("unknown", result.context)

    expect(result.notifications).toEqual([
      { message: "Usage: /widget-layout [status]", type: "warning" },
    ])
    expect(result.appendedEntries).toHaveLength(0)
  })
})
