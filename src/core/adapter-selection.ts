import type { NativeAdapter } from "../adapters/types"
import { attemptAsync } from "./result"

export interface SingleAdapterSelection {
  adapter: NativeAdapter | null
  unknownId: string | null
}

export interface AdapterSelection {
  active: NativeAdapter[]
  unknownIds: string[]
}

async function isDetected(adapter: NativeAdapter, target: string): Promise<boolean> {
  const detect = adapter.detect
  if (detect === undefined) return false

  const [detected, detectionError] = await attemptAsync(() => detect(target))
  if (detectionError) return false

  return detected === true
}

export async function selectAdapter(
  target: string,
  configuredId: string | undefined,
  available: NativeAdapter[],
): Promise<SingleAdapterSelection> {
  if (configuredId !== undefined) {
    const adapter = available.find((candidate) => candidate.id === configuredId)
    if (adapter === undefined) return { adapter: null, unknownId: configuredId }

    return { adapter, unknownId: null }
  }

  for (const adapter of available) {
    if (await isDetected(adapter, target)) return { adapter, unknownId: null }
  }

  return { adapter: null, unknownId: null }
}

export async function selectAdapters(
  target: string,
  configuredIds: string[],
  available: NativeAdapter[],
): Promise<AdapterSelection> {
  const configured = new Set(configuredIds)
  const availableIds = new Set(available.map((adapter) => adapter.id))
  const unknownIds = configuredIds.filter((id) => !availableIds.has(id))
  const active: NativeAdapter[] = []

  for (const adapter of available) {
    if (configured.has(adapter.id) || (await isDetected(adapter, target))) {
      active.push(adapter)
    }
  }

  active.sort((left, right) => left.id.localeCompare(right.id))

  return { active, unknownIds }
}

export function requiredToolsFor(adapters: NativeAdapter[]): string[] {
  const names = new Set<string>()

  for (const adapter of adapters) {
    for (const name of adapter.requiredTools ?? [adapter.tool]) names.add(name)
  }

  return [...names].sort()
}
