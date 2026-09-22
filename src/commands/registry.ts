import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import type { WidgetLayoutController } from "../controller.ts"
import type { WidgetLayoutConfig } from "../types.ts"
import type { AutocompleteItem } from "@earendil-works/pi-tui"

export interface WidgetLayoutCommandRuntime {
  readonly controller: WidgetLayoutController
  readonly config: WidgetLayoutConfig
}

export interface WidgetLayoutSubcommand {
  readonly name: string
  readonly description?: string

  getArgumentCompletions?(prefix: string): AutocompleteItem[] | null

  run(args: string, ctx: ExtensionContext): void | Promise<void>
}

export class WidgetLayoutCommandRegistry {
  private readonly commands = new Map<string, WidgetLayoutSubcommand>()
  private defaultCommand?: string

  register(command: WidgetLayoutSubcommand, options?: { default?: boolean }): void {
    if (this.commands.has(command.name)) {
      throw new Error(`Duplicate widget-layout command: ${command.name}`)
    }

    this.commands.set(command.name, command)
    if (options?.default === true) {
      this.defaultCommand = command.name
    }
  }

  get(name: string): WidgetLayoutSubcommand | undefined {
    return this.commands.get(name)
  }

  list(): readonly WidgetLayoutSubcommand[] {
    return [...this.commands.values()]
  }

  getDefault(): WidgetLayoutSubcommand | undefined {
    return this.defaultCommand === undefined ? undefined : this.get(this.defaultCommand)
  }
}
