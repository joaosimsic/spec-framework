import type { SdocBlock } from "../core/types"
import { ArchitectureGraphSource, loadArchitectureSources } from "./architecture"
import { ContractsGraphSource, loadContractSources } from "./contracts"
import { FormalGraphSource, loadFormalSources } from "./formal"
import { RequirementsGraphSource } from "./requirements"
import type { GraphContribution } from "./types"

export async function collectWorkspaceContributions(
  target: string,
  blocks: SdocBlock[],
): Promise<GraphContribution[]> {
  const knownIds = new Set(
    blocks
      .map((block) => block.fields.UID)
      .filter((id): id is string => id !== undefined && id !== ""),
  )
  const [architecture, contracts, formal] = await Promise.all([
    loadArchitectureSources(target),
    loadContractSources(target),
    loadFormalSources(target),
  ])

  return [
    new RequirementsGraphSource().collect(blocks),
    new ArchitectureGraphSource().collect(architecture, knownIds),
    new ContractsGraphSource().collect(contracts, knownIds),
    new FormalGraphSource().collect(formal, knownIds),
  ]
}
