import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

import { registerCommands } from "./commands/index.ts"
import type { WidgetLayoutCommandRuntime } from "./commands/registry.ts"
import { loadWidgetLayoutConfig } from "./config.ts"
import { WidgetLayoutController } from "./controller.ts"

export default function widgetLayoutExtension(pi: ExtensionAPI): void {
  let runtime: WidgetLayoutCommandRuntime | undefined

  registerCommands(pi, () => runtime)

  pi.on("session_start", (_event, ctx) => {
    runtime?.controller.dispose()
    runtime = undefined

    if (!ctx.hasUI || ctx.mode !== "tui") {
      return
    }

    const { config, diagnostics } = loadWidgetLayoutConfig({
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted?.() ?? false,
    })
    for (const diagnostic of diagnostics) {
      ctx.ui.notify(`[widget-layout] ${diagnostic.message}`, "warning")
    }

    const controller = new WidgetLayoutController(ctx.ui, config)
    controller.install()
    runtime = { controller, config }
  })

  pi.on("session_shutdown", () => {
    runtime?.controller.dispose()
    runtime = undefined
  })
}
