import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

import { loadWidgetLayoutConfig } from "./config.ts"
import { WidgetLayoutController } from "./controller.ts"

export default function widgetLayoutExtension(pi: ExtensionAPI): void {
  let controller: WidgetLayoutController | undefined

  pi.on("session_start", (_event, ctx) => {
    controller?.dispose()
    controller = undefined

    if (!ctx.hasUI || ctx.mode !== "tui") {
      return
    }

    const { config, diagnostics } = loadWidgetLayoutConfig()
    for (const diagnostic of diagnostics) {
      ctx.ui.notify(`[widget-layout] ${diagnostic.message}`, "warning")
    }

    controller = new WidgetLayoutController(ctx.ui, config)
    controller.install()
  })

  pi.on("session_shutdown", () => {
    controller?.dispose()
    controller = undefined
  })
}
