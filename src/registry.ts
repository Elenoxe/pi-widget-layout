import type { ManagedWidgetRoute } from "./layout.ts"

export interface WidgetRecord<T> {
  key: string
  content: T | undefined
  route: ManagedWidgetRoute
  active: boolean
  firstSeen: number
}

export class WidgetRegistry<T> {
  private readonly records = new Map<string, WidgetRecord<T>>()

  private nextFirstSeen = 0

  set(key: string, content: T, route: ManagedWidgetRoute): WidgetRecord<T>

  set(key: string, content: undefined, route: ManagedWidgetRoute): WidgetRecord<T> | undefined

  set(key: string, content: T | undefined, route: ManagedWidgetRoute): WidgetRecord<T> | undefined {
    const existing = this.records.get(key)

    if (content === undefined) {
      if (existing !== undefined) {
        existing.content = undefined
        existing.route = route
        existing.active = false
      }
      return existing
    }

    if (existing !== undefined) {
      existing.content = content
      existing.route = route
      existing.active = true
      return existing
    }

    const record: WidgetRecord<T> = {
      key,
      content,
      route,
      active: true,
      firstSeen: this.nextFirstSeen,
    }
    this.nextFirstSeen += 1
    this.records.set(key, record)
    return record
  }

  clear(key: string): void {
    const record = this.records.get(key)
    if (record === undefined) {
      return
    }

    record.content = undefined
    record.active = false
  }

  get(key: string): WidgetRecord<T> | undefined {
    return this.records.get(key)
  }

  getActiveRecords(): readonly WidgetRecord<T>[] {
    return [...this.records.values()]
      .filter((record) => record.active)
      .sort((left, right) => {
        const bucketDifference = left.route.bucket.index - right.route.bucket.index
        return bucketDifference || left.firstSeen - right.firstSeen
      })
  }

  reset(): void {
    this.records.clear()
    this.nextFirstSeen = 0
  }
}
