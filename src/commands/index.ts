import type { AutocompleteItem } from "@earendil-works/pi-tui"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"

import { registerStatusCommand } from "./status.ts"
import { WidgetLayoutCommandRegistry, type WidgetLayoutCommandRuntime } from "./registry.ts"

export function getArgumentCompletions(
  registry: WidgetLayoutCommandRegistry,
  argumentPrefix: string,
): AutocompleteItem[] | null {
  const firstSpace = argumentPrefix.indexOf(" ")
  if (firstSpace < 0) {
    const prefix = argumentPrefix
    const matches = registry.list().filter((command) => command.name.startsWith(prefix))

    return matches.length === 0
      ? null
      : matches.map((command) => ({
          value: command.name,
          label: command.name,
          description: command.description,
        }))
  }

  const commandName = argumentPrefix.slice(0, firstSpace)
  const argumentPrefixForCommand = argumentPrefix.slice(firstSpace + 1)
  const command = registry.get(commandName)
  return command?.getArgumentCompletions?.(argumentPrefixForCommand) ?? null
}

function formatUsage(registry: WidgetLayoutCommandRegistry): string {
  const commands = registry
    .list()
    .map((command) => command.name)
    .join("|")
  return `Usage: /widget-layout [${commands}]`
}

function registerRootCommand(pi: ExtensionAPI, registry: WidgetLayoutCommandRegistry): void {
  pi.registerCommand("widget-layout", {
    description: "Show current widget layout",
    getArgumentCompletions: (argumentPrefix) => getArgumentCompletions(registry, argumentPrefix),
    handler: async (argumentsText, ctx) => {
      if (!ctx.hasUI || ctx.mode !== "tui") {
        return
      }

      const trimmed = argumentsText.trim()
      if (trimmed.length === 0) {
        await registry.getDefault()?.run("", ctx)
        return
      }

      const firstSpace = trimmed.indexOf(" ")
      const commandName = firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace)
      const args = firstSpace < 0 ? "" : trimmed.slice(firstSpace + 1)
      const command = registry.get(commandName)

      if (command === undefined) {
        ctx.ui.notify(formatUsage(registry), "warning")
        return
      }

      await command.run(args, ctx)
    },
  })
}

export function registerCommands(
  pi: ExtensionAPI,
  getRuntime: () => WidgetLayoutCommandRuntime | undefined,
  reload: (ctx: ExtensionContext) => void,
): void {
  const registry = new WidgetLayoutCommandRegistry()
  registerStatusCommand(registry, { pi, getRuntime })
  registry.register({
    name: "reload",
    description: "Reload widget layout configuration and reorder widgets",
    run: (_args, ctx) => reload(ctx),
  })
  registerRootCommand(pi, registry)
}

export type { WidgetLayoutCommandRuntime, WidgetLayoutSubcommand } from "./registry.ts"
export { WidgetLayoutCommandRegistry } from "./registry.ts"
