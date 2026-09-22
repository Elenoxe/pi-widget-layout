import { describe, expect, test } from "bun:test"

import {
  WidgetLayoutCommandRegistry,
  type WidgetLayoutSubcommand,
} from "../../src/commands/registry.ts"

function command(name: string): WidgetLayoutSubcommand {
  return {
    name,
    run: () => undefined,
  }
}

describe("WidgetLayoutCommandRegistry", () => {
  test("preserves registration order and returns registered commands", () => {
    const registry = new WidgetLayoutCommandRegistry()
    const status = command("status")
    const reload = command("reload")

    registry.register(status)
    registry.register(reload)

    expect(registry.list()).toEqual([status, reload])
    expect(registry.get("status")).toBe(status)
    expect(registry.get("reload")).toBe(reload)
    expect(registry.get("missing")).toBeUndefined()
  })

  test("rejects duplicate command names without replacing the first command", () => {
    const registry = new WidgetLayoutCommandRegistry()
    const first = command("status")
    const duplicate = command("status")

    registry.register(first)

    expect(() => registry.register(duplicate)).toThrow("Duplicate widget-layout command: status")
    expect(registry.list()).toEqual([first])
    expect(registry.get("status")).toBe(first)
  })

  test("returns the command registered as default", () => {
    const registry = new WidgetLayoutCommandRegistry()
    const status = command("status")
    const reload = command("reload")

    registry.register(status, { default: true })
    registry.register(reload)

    expect(registry.getDefault()).toBe(status)
    expect(registry.list()).toEqual([status, reload])
  })
})
