import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"

import { registerCommands } from "./commands/index.ts"
import type { WidgetLayoutCommandRuntime } from "./commands/registry.ts"
import { loadWidgetLayoutConfig } from "./config.ts"
import { WidgetLayoutController } from "./controller.ts"

export default function widgetLayoutExtension(pi: ExtensionAPI): void {
  let runtime: WidgetLayoutCommandRuntime | undefined

  const readConfig = (ctx: ExtensionContext) => {
    const result = loadWidgetLayoutConfig({
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted?.() ?? false,
    })
    for (const diagnostic of result.diagnostics) {
      ctx.ui.notify(`[widget-layout] ${diagnostic.message}`, "warning")
    }
    return result
  }

  registerCommands(
    pi,
    () => runtime,
    (ctx) => {
      if (!runtime) return
      const { config, diagnostics } = readConfig(ctx)
      if (diagnostics.length > 0) {
        ctx.ui.notify("Widget layout reload failed; keeping the current configuration", "warning")
        return
      }
      runtime.controller.reload(config)
      runtime = { controller: runtime.controller, config }
      ctx.ui.notify("Widget layout reloaded", "info")
    },
  )

  pi.on("session_start", (_event, ctx) => {
    runtime?.controller.dispose()
    runtime = undefined

    if (!ctx.hasUI || ctx.mode !== "tui") {
      return
    }

    const { config } = readConfig(ctx)
    const controller = new WidgetLayoutController(ctx.ui, config)
    controller.install()
    runtime = { controller, config }
  })

  pi.on("session_shutdown", () => {
    runtime?.controller.dispose()
    runtime = undefined
  })
}
