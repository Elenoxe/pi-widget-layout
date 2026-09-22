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
  position: "above" | "below"
  index: number
}

export type ManagedBucket = SelectorBucket | UnlistedBucket

export interface ManagedWidgetRoute {
  kind: "managed"
  placement: WidgetPlacement
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
  const section = config[requestedPlacement]
  const order = compiledOrder ?? compileOrder(section.order)
  const match = matchWidget(key, order)
  if (match !== undefined) {
    return {
      kind: "managed",
      placement: requestedPlacement,
      bucket: {
        kind: "selector",
        selector: match.selector,
        index: match.index,
      },
    }
  }

  const position = section.unlisted
  if (position !== "native") {
    return {
      kind: "managed",
      placement: requestedPlacement,
      bucket: {
        kind: "unlisted",
        position,
        index: position === "above" ? -1 : section.order.length,
      },
    }
  }

  return { kind: "native", placement: requestedPlacement }
}
