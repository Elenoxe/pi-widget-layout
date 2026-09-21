import type { CompiledOrder } from "./matcher.ts"
import { compileOrder, matchWidget } from "./matcher.ts"
import type { WidgetLayoutConfig, WidgetPlacement } from "./types.ts"

export interface SelectorBucket {
  kind: "selector"
  selector: string
  index: number
}

export interface UnlistedBucket {
  kind: "unlisted"
  index: number
}

export type ManagedBucket = SelectorBucket | UnlistedBucket

export interface ManagedWidgetRoute {
  kind: "managed"
  placement: "aboveEditor"
  bucket: ManagedBucket
}

export interface NativeWidgetRoute {
  kind: "native"
  placement: WidgetPlacement
}

export type WidgetRoute = ManagedWidgetRoute | NativeWidgetRoute

export function routeWidget(
  key: string,
  requestedPlacement: WidgetPlacement,
  config: WidgetLayoutConfig,
  compiledOrder?: CompiledOrder,
): WidgetRoute {
  if (requestedPlacement === "belowEditor") {
    return { kind: "native", placement: "belowEditor" }
  }

  const order = compiledOrder ?? compileOrder(config.aboveEditor.order)
  const match = matchWidget(key, order)
  if (match !== undefined) {
    return {
      kind: "managed",
      placement: "aboveEditor",
      bucket: {
        kind: "selector",
        selector: match.selector,
        index: match.index,
      },
    }
  }

  if (config.aboveEditor.unlisted === "above") {
    return {
      kind: "managed",
      placement: "aboveEditor",
      bucket: {
        kind: "unlisted",
        index: config.aboveEditor.order.length,
      },
    }
  }

  if (config.aboveEditor.unlisted === "below") {
    return { kind: "native", placement: "belowEditor" }
  }

  return { kind: "native", placement: "aboveEditor" }
}
