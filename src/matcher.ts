export type SelectorKind = "exact" | "wildcard" | "catchAll"

export interface SelectorMatch {
  selector: string
  index: number
  kind: SelectorKind
}

export interface CompiledWildcard {
  selector: string
  index: number
  regex: RegExp
}

export interface CompiledOrder {
  exact: Map<string, SelectorMatch>
  wildcards: CompiledWildcard[]
  catchAll?: SelectorMatch
}

function selectorRegex(selector: string): RegExp {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, (character) => {
    return character === "*" ? ".*" : `\\${character}`
  })

  return new RegExp(`^${escaped}$`)
}

export function compileOrder(order: readonly string[]): CompiledOrder {
  const compiled: CompiledOrder = {
    exact: new Map(),
    wildcards: [],
  }

  for (const [index, selector] of order.entries()) {
    if (selector === "*") {
      if (compiled.catchAll === undefined) {
        compiled.catchAll = { selector, index, kind: "catchAll" }
      }
      continue
    }

    if (selector.includes("*")) {
      compiled.wildcards.push({
        selector,
        index,
        regex: selectorRegex(selector),
      })
      continue
    }

    if (!compiled.exact.has(selector)) {
      compiled.exact.set(selector, { selector, index, kind: "exact" })
    }
  }

  return compiled
}

export function matchWidget(key: string, compiledOrder: CompiledOrder): SelectorMatch | undefined {
  const exact = compiledOrder.exact.get(key)
  if (exact !== undefined) {
    return exact
  }

  for (const wildcard of compiledOrder.wildcards) {
    if (wildcard.regex.test(key)) {
      return {
        selector: wildcard.selector,
        index: wildcard.index,
        kind: "wildcard",
      }
    }
  }

  return compiledOrder.catchAll
}
