import type { ManagedWidgetRoute } from "./routing.ts"

interface MutableWidgetRecord<T> {
  key: string
  content: T | undefined
  route: ManagedWidgetRoute
  active: boolean
  firstSeen: number
  revision: number
}

export interface WidgetRecord<T> {
  readonly key: string
  readonly content: T | undefined
  readonly route: ManagedWidgetRoute
  readonly active: boolean
  readonly firstSeen: number
  readonly revision: number
}

function snapshotRecord<T>(record: MutableWidgetRecord<T>): WidgetRecord<T> {
  return {
    key: record.key,
    content: record.content,
    route: {
      ...record.route,
      bucket: { ...record.route.bucket },
    },
    active: record.active,
    firstSeen: record.firstSeen,
    revision: record.revision,
  }
}

export class WidgetRegistry<T> {
  private readonly records = new Map<string, MutableWidgetRecord<T>>()

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
      return existing === undefined ? undefined : snapshotRecord(existing)
    }

    if (existing !== undefined) {
      existing.content = content
      existing.route = route
      existing.active = true
      existing.revision += 1
      return snapshotRecord(existing)
    }

    const record: MutableWidgetRecord<T> = {
      key,
      content,
      route,
      active: true,
      firstSeen: this.nextFirstSeen,
      revision: 0,
    }
    this.nextFirstSeen += 1
    this.records.set(key, record)
    return snapshotRecord(record)
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
    const record = this.records.get(key)
    return record === undefined ? undefined : snapshotRecord(record)
  }

  getActiveRecords(): readonly WidgetRecord<T>[] {
    return [...this.records.values()]
      .filter((record) => record.active)
      .sort((left, right) => {
        const bucketDifference = left.route.bucket.index - right.route.bucket.index
        return bucketDifference || left.firstSeen - right.firstSeen
      })
      .map(snapshotRecord)
  }

  reset(): void {
    this.records.clear()
    this.nextFirstSeen = 0
  }
}
