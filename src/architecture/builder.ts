import {
  IrIdentity,
  type IrElement,
  type IrEntryPoint,
  type IrFlow,
  type IrRelationship,
} from "../analysis/ir"
import {
  GeneratedSpecIdentity,
  type GeneratedConceptualElement,
  type GeneratedCoverage,
  type GeneratedDataAccess,
  type GeneratedImplementation,
  type GeneratedImplementationFile,
  type GeneratedImplementationSymbol,
  type GeneratedLabelRole,
  type GeneratedMapping,
  type GeneratedRelationship,
} from "../spec"
import { ConceptualLabeler } from "./labeler"
import { PackageNameLookup } from "./packages"
import type { ConceptualArchitecture, ConceptualBuildInput } from "./types"

const SYMBOL_TYPES = new Set([
  "function",
  "method",
  "class",
  "interface",
  "type_alias",
  "property",
  "constant",
  "enum",
])

const TRAVERSAL = new Set(["calls", "imports", "references", "inherits", "implements"])
const MERGE_THRESHOLD = 0.8
const TEST_PATH = /(?:^tests?\/|\.test\.|\.spec\.)/

interface AnchorGroup {
  key: string
  keys: string[]
  role: GeneratedLabelRole
  anchor: string
  family: string
  entries: IrEntryPoint[]
  nodeIds: Set<string>
  evidence: string[]
  reached: Map<string, number>
}

interface Owner {
  componentKey: string
  distance: number
  ambiguous: Set<string>
}

interface DataObservation {
  key: string
  kinds: Set<"read" | "write">
  channel: string
  target: string
  elementIds: Set<string>
  componentKeys: Set<string>
}

interface ExternalObservation {
  packageName: string
  elementIds: Set<string>
  componentKeys: Set<string>
}

export class ConceptualArchitectureBuilder {
  async build(input: ConceptualBuildInput): Promise<ConceptualArchitecture> {
    const byId = new Map(input.elements.map((element) => [element.id, element]))
    const flowByEntry = new Map(input.flows.map((flow) => [flow.entryPointId, flow]))
    const packages = new PackageNameLookup(input.root)
    const groups = await this.groups(input, byId, packages)
    const adjacency = this.adjacency(input.relationships, byId)
    for (const group of groups) group.reached = this.reach(group.nodeIds, adjacency, byId)
    const merged = this.merge(groups)
    const implementation = this.implementation(input.elements)
    const implementationIds = new Set([
      ...implementation.files.map((file) => file.id),
      ...implementation.symbols.map((symbol) => symbol.id),
    ])
    const componentIds = new Map(
      merged.map((group) => [group.key, GeneratedSpecIdentity.component(group.keys)]),
    )
    const ownership = this.ownership(merged, implementationIds)
    const subsystemByFamily = new Map<string, GeneratedConceptualElement>()
    const system = this.system(input.projectName, merged.length)
    const components = merged.map((group) =>
      this.component(
        group,
        componentIds,
        subsystemByFamily,
        system.id,
        byId,
        flowByEntry,
        ownership,
        input.entryPoints,
        input.relationships,
      ),
    )
    const subsystems = [...subsystemByFamily.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )
    const interfaces = this.interfaces(
      input.entryPoints,
      byId,
      flowByEntry,
      ownership,
      componentIds,
    )
    const data = this.dataObservations(merged, byId, componentIds)
    const externals = this.externalObservations(merged, byId, componentIds)
    const dataStores = this.dataStores(data)
    const externalSystems = this.externalSystems(externals)
    const mappings = this.mappings(
      merged,
      componentIds,
      ownership,
      byId,
      interfaces,
      data,
      externals,
      input.entryPoints,
      flowByEntry,
    )
    const relationships = this.relationships(
      merged,
      componentIds,
      ownership,
      interfaces,
      data,
      externals,
      input.relationships,
    )
    const coverage = this.coverage(
      merged,
      componentIds,
      ownership,
      implementation,
      input.entryPoints,
      flowByEntry,
      externalSystems,
    )
    const componentByEntry = Object.fromEntries(
      merged.flatMap((group) =>
        group.entries.map((entry) => [entry.id, componentIds.get(group.key) ?? ""]),
      ),
    )
    const componentByImplementation = Object.fromEntries(
      [...ownership.entries()].map(([implementationId, owner]) => [
        implementationId,
        componentIds.get(owner.componentKey) ?? "",
      ]),
    )

    return {
      architecture: {
        system,
        subsystems,
        components,
        interfaces,
        data_stores: dataStores,
        external_systems: externalSystems,
        relationships,
        coverage,
      },
      implementation,
      mappings,
      component_by_entry: componentByEntry,
      component_by_implementation: componentByImplementation,
    }
  }

  private async groups(
    input: ConceptualBuildInput,
    byId: Map<string, IrElement>,
    packages: PackageNameLookup,
  ): Promise<AnchorGroup[]> {
    const values = new Map<string, AnchorGroup>()
    for (const entry of [...input.entryPoints].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      const group = await this.group(entry, byId.get(entry.nodeId), packages, input.projectName)
      const existing = values.get(group.key)
      if (existing === undefined) {
        values.set(group.key, group)
        continue
      }
      existing.entries.push(entry)
      existing.nodeIds.add(entry.nodeId)
      existing.evidence = [...new Set([...existing.evidence, entry.id])].sort()
    }

    return [...values.values()].sort((left, right) => left.key.localeCompare(right.key))
  }

  private async group(
    entry: IrEntryPoint,
    element: IrElement | undefined,
    packages: PackageNameLookup,
    projectName: string,
  ): Promise<AnchorGroup> {
    const base = {
      entries: [entry],
      nodeIds: new Set([entry.nodeId]),
      evidence: [entry.id],
      reached: new Map<string, number>(),
    }
    if (entry.kind === "http_route") {
      const route = entry.metadata["route"] ?? entry.label.split(" ").at(-1) ?? "/"
      const anchor = ConceptualLabeler.routeGroup(route)
      return {
        ...base,
        key: `http:${anchor}`,
        keys: [`http:${anchor}`],
        role: "HTTP",
        anchor,
        family: "HTTP",
      }
    }
    if (entry.kind === "library_api") {
      const packageName = (await packages.nameFor(element?.filePath ?? "")) ?? projectName
      return {
        ...base,
        key: `api:${packageName}`,
        keys: [`api:${packageName}`],
        role: "API",
        anchor: packageName,
        family: "API",
      }
    }
    if (entry.kind === "application_main") {
      const packageName = (await packages.nameFor(element?.filePath ?? "")) ?? projectName
      return {
        ...base,
        key: `app:${packageName}`,
        keys: [`app:${packageName}`],
        role: "APP",
        anchor: packageName,
        family: "APP",
      }
    }
    if (entry.kind === "event_handler") {
      const anchor = entry.metadata["name"] ?? "event"
      return {
        ...base,
        key: `jobs:${anchor}`,
        keys: [`jobs:${anchor}`],
        role: "JOBS",
        anchor,
        family: "JOBS",
      }
    }
    const name = entry.metadata["name"] ?? (entry.kind === "cli" ? "entry" : entry.kind)
    const role: GeneratedLabelRole = entry.kind === "cli" ? "CLI" : "ENTRY"
    return {
      ...base,
      key: `${role.toLowerCase()}:${name}`,
      keys: [`${role.toLowerCase()}:${name}`],
      role,
      anchor: name,
      family: role,
    }
  }

  private adjacency(
    relationships: IrRelationship[],
    byId: Map<string, IrElement>,
  ): Map<string, string[]> {
    const values = new Map<string, string[]>()
    for (const relationship of relationships) {
      if (!TRAVERSAL.has(relationship.type)) continue
      if (relationship.resolution !== "resolved") continue
      if (!byId.has(relationship.sourceId) || !byId.has(relationship.targetId)) continue
      const targets = values.get(relationship.sourceId) ?? []
      targets.push(relationship.targetId)
      values.set(relationship.sourceId, [...new Set(targets)].sort())
    }

    return values
  }

  private reach(
    anchors: Set<string>,
    adjacency: Map<string, string[]>,
    byId: Map<string, IrElement>,
  ): Map<string, number> {
    const distances = new Map<string, number>()
    const pending = [...anchors].sort().map((id) => ({ id, distance: 0 }))
    for (let index = 0; index < pending.length; index++) {
      const current = pending[index]
      if (current === undefined) continue
      if (!byId.has(current.id)) continue
      const existing = distances.get(current.id)
      if (existing !== undefined && existing <= current.distance) continue
      distances.set(current.id, current.distance)
      const element = byId.get(current.id)
      if (element !== undefined && element.type !== "module") {
        const fileId = IrIdentity.file(element.filePath)
        if (byId.has(fileId)) {
          const fileDistance = distances.get(fileId)
          if (fileDistance === undefined || current.distance < fileDistance) {
            distances.set(fileId, current.distance)
          }
        }
      }
      if (current.distance >= 12) continue
      for (const target of adjacency.get(current.id) ?? []) {
        pending.push({ id: target, distance: current.distance + 1 })
      }
    }

    return distances
  }

  private merge(groups: AnchorGroup[]): AnchorGroup[] {
    const parents = groups.map((_, index) => index)
    const find = (index: number): number => {
      const parent = parents[index] ?? index
      if (parent === index) return index
      const root = find(parent)
      parents[index] = root
      return root
    }
    const union = (left: number, right: number): void => {
      const leftRoot = find(left)
      const rightRoot = find(right)
      if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
    }
    for (let left = 0; left < groups.length; left++) {
      for (let right = left + 1; right < groups.length; right++) {
        const leftGroup = groups[left]
        const rightGroup = groups[right]
        if (leftGroup === undefined || rightGroup === undefined) continue
        if (leftGroup.family !== rightGroup.family) continue
        if (this.overlap(leftGroup.reached, rightGroup.reached) < MERGE_THRESHOLD) continue
        union(left, right)
      }
    }
    const merged = new Map<number, AnchorGroup[]>()
    for (let index = 0; index < groups.length; index++) {
      const root = find(index)
      const group = groups[index]
      if (group === undefined) continue
      const values = merged.get(root) ?? []
      values.push(group)
      merged.set(root, values)
    }

    return [...merged.values()]
      .map((values) => this.merged(values))
      .sort((left, right) => left.key.localeCompare(right.key))
  }

  private merged(values: AnchorGroup[]): AnchorGroup {
    const sorted = [...values].sort((left, right) => left.key.localeCompare(right.key))
    const primary = [...sorted].sort(
      (left, right) =>
        right.entries.length - left.entries.length || left.key.localeCompare(right.key),
    )[0]
    const keys = sorted.flatMap((group) => group.keys).sort()
    const entries = sorted
      .flatMap((group) => group.entries)
      .sort((left, right) => left.id.localeCompare(right.id))
    const reached = new Map<string, number>()
    for (const group of sorted) {
      for (const [id, distance] of group.reached) {
        const current = reached.get(id)
        if (current === undefined || distance < current) reached.set(id, distance)
      }
    }

    return {
      key: keys.join("|"),
      keys,
      role: primary?.role ?? "UNCLASSIFIED",
      anchor: primary?.anchor ?? "behavior",
      family: primary?.family ?? "UNCLASSIFIED",
      entries,
      nodeIds: new Set(sorted.flatMap((group) => [...group.nodeIds])),
      evidence: sorted.flatMap((group) => group.evidence).sort(),
      reached,
    }
  }

  private overlap(left: Map<string, number>, right: Map<string, number>): number {
    if (left.size === 0 || right.size === 0) return 0
    let intersection = 0
    for (const id of left.keys()) if (right.has(id)) intersection++
    return intersection / (left.size + right.size - intersection)
  }

  private ownership(groups: AnchorGroup[], implementationIds: Set<string>): Map<string, Owner> {
    const owners = new Map<string, Owner>()
    const ordered = [...groups].sort((left, right) => left.key.localeCompare(right.key))
    for (const group of ordered) {
      for (const [implementationId, distance] of group.reached) {
        if (!implementationIds.has(implementationId)) continue
        const existing = owners.get(implementationId)
        if (existing === undefined) {
          owners.set(implementationId, { componentKey: group.key, distance, ambiguous: new Set() })
          continue
        }
        if (distance < existing.distance) {
          owners.set(implementationId, {
            componentKey: group.key,
            distance,
            ambiguous: new Set(),
          })
          continue
        }
        if (distance === existing.distance) existing.ambiguous.add(group.key)
      }
    }

    return owners
  }

  private implementation(elements: IrElement[]): GeneratedImplementation {
    const modules = new Map(
      elements
        .filter((element) => element.type === "module")
        .map((element) => [element.filePath, element]),
    )
    const files: GeneratedImplementationFile[] = [...modules.values()]
      .map((element) => ({
        id: element.id,
        path: element.filePath,
        language: element.language,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
    const symbols: GeneratedImplementationSymbol[] = elements
      .filter((element) => SYMBOL_TYPES.has(element.type))
      .map((element) => ({
        id: element.id,
        file_id: IrIdentity.file(element.filePath),
        type: element.type,
        name: element.name,
        qualified_name: element.qualifiedName,
        signature: element.signature,
        start_line: Math.max(1, element.startLine),
        end_line: Math.max(1, element.endLine),
        visibility: element.visibility,
        exported: element.exported,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))

    return { files, symbols }
  }

  private system(projectName: string, componentCount: number): GeneratedConceptualElement {
    const label = ConceptualLabeler.label("SYSTEM", projectName)
    return {
      id: GeneratedSpecIdentity.system(projectName),
      type: "system",
      label: label.label,
      label_role: label.role,
      label_anchor: label.anchor,
      label_evidence: ["spec-framework.json#project.name"],
      parent_id: null,
      summary: `Generated system boundary with ${componentCount} behavior-derived components.`,
      confidence: "observed",
      status: "observed",
      provenance: "spec-framework.json#project.name",
      evidence: ["spec-framework.json#project.name"],
      entry_points: [],
      public_surface: [],
      data_access: [],
      tests: [],
      unknowns: [],
    }
  }

  private component(
    group: AnchorGroup,
    componentIds: Map<string, string>,
    subsystemByFamily: Map<string, GeneratedConceptualElement>,
    systemId: string,
    byId: Map<string, IrElement>,
    flowByEntry: Map<string, IrFlow>,
    ownership: Map<string, Owner>,
    entries: IrEntryPoint[],
    relationships: IrRelationship[],
  ): GeneratedConceptualElement {
    const label = ConceptualLabeler.label(group.role, group.anchor)
    const componentId = componentIds.get(group.key) ?? GeneratedSpecIdentity.component(group.keys)
    const subsystem = this.subsystem(group.family, group.keys, subsystemByFamily, systemId)
    const data = this.componentData(group, byId)
    const external = this.componentExternal(group, byId)
    const tests = this.tests(group, byId, relationships)
    const unknowns = [
      ...new Set(group.entries.flatMap((entry) => flowByEntry.get(entry.id)?.unknowns ?? [])),
    ].sort()
    const mapped = [...ownership.entries()].filter(([, owner]) => owner.componentKey === group.key)
    const files = mapped.filter(([id]) => id.startsWith("FILE-")).length
    const symbols = mapped.filter(([id]) => id.startsWith("SYM-")).length
    const ambiguous = mapped.some(([, owner]) => owner.ambiguous.size > 0)
    const confidence = ambiguous
      ? "ambiguous"
      : group.entries.some((entry) => entry.confidence === "observed")
        ? "observed"
        : "inferred"
    const publicSurface = [
      ...new Set(group.entries.map((entry) => this.surface(entry, byId))),
    ].sort()
    const summary = this.componentSummary(group, data, external, tests, files, symbols, unknowns)

    return {
      id: componentId,
      type: "component",
      label: label.label,
      label_role: label.role,
      label_anchor: label.anchor,
      label_evidence: group.keys,
      parent_id: subsystem.id,
      summary,
      confidence,
      status: confidence,
      provenance: "analysis:behavior-anchor",
      evidence: group.evidence,
      entry_points: group.entries.map((entry) => entry.id).sort(),
      public_surface: publicSurface,
      data_access: data,
      tests,
      unknowns,
    }
  }

  private subsystem(
    family: string,
    evidence: string[],
    values: Map<string, GeneratedConceptualElement>,
    systemId: string,
  ): GeneratedConceptualElement {
    const existing = values.get(family)
    if (existing !== undefined) {
      existing.label_evidence = [...new Set([...existing.label_evidence, ...evidence])].sort()
      return existing
    }
    const label = ConceptualLabeler.label("FAMILY", family)
    const element: GeneratedConceptualElement = {
      id: GeneratedSpecIdentity.subsystem(family),
      type: "subsystem",
      label: label.label,
      label_role: label.role,
      label_anchor: label.anchor,
      label_evidence: [...new Set(evidence)].sort(),
      parent_id: systemId,
      summary: `Behavior family ${family}.`,
      confidence: "inferred",
      status: "inferred",
      provenance: "analysis:behavior-family",
      evidence: [...new Set(evidence)].sort(),
      entry_points: [],
      public_surface: [],
      data_access: [],
      tests: [],
      unknowns: [],
    }
    values.set(family, element)

    return element
  }

  private interfaces(
    entries: IrEntryPoint[],
    byId: Map<string, IrElement>,
    flowByEntry: Map<string, IrFlow>,
    ownership: Map<string, Owner>,
    componentIds: Map<string, string>,
  ): GeneratedConceptualElement[] {
    return entries
      .map((entry) => {
        const element = byId.get(entry.nodeId)
        const owner = ownership.get(entry.nodeId)
        const role = this.entryRole(entry.kind)
        const anchor = this.entryAnchor(entry)
        const label = ConceptualLabeler.label(role, anchor)
        const flow = flowByEntry.get(entry.id)
        const dataAccess = this.flowData(flow)
        return {
          id: GeneratedSpecIdentity.interface(entry.kind, entry.id),
          type: "interface" as const,
          label: label.label,
          label_role: label.role,
          label_anchor: label.anchor,
          label_evidence: [entry.id],
          parent_id: owner === undefined ? null : (componentIds.get(owner.componentKey) ?? null),
          summary:
            flow === undefined
              ? `Observed ${entry.kind} surface ${entry.label}.`
              : `Observed ${entry.kind} surface ${entry.label} with ${flow.steps.length} static steps.`,
          confidence: entry.confidence,
          status: entry.confidence,
          provenance: entry.provenance,
          evidence: [entry.id],
          entry_points: [entry.id],
          public_surface: [element?.qualifiedName ?? entry.label],
          data_access: dataAccess,
          tests: [],
          unknowns: flow?.unknowns ?? [],
        }
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  private entryRole(kind: IrEntryPoint["kind"]): GeneratedLabelRole {
    if (kind === "http_route") return "HTTP"
    if (kind === "library_api") return "API"
    if (kind === "application_main") return "APP"
    if (kind === "event_handler") return "JOBS"
    if (kind === "cli") return "CLI"
    return "ENTRY"
  }

  private entryAnchor(entry: IrEntryPoint): string {
    if (entry.kind === "http_route") {
      const method = entry.metadata["method"] ?? entry.label.split(" ")[0] ?? "GET"
      const route = entry.metadata["route"] ?? entry.label.split(" ").at(-1) ?? "/"
      return ConceptualLabeler.routeAnchor(method, route)
    }
    if (entry.kind === "library_api") return entry.label
    return entry.metadata["name"] ?? entry.label
  }

  private flowData(flow: IrFlow | undefined): GeneratedDataAccess[] {
    if (flow === undefined) return []
    const values = new Map<string, GeneratedDataAccess>()
    for (const access of [...flow.sources, ...flow.sinks]) {
      const kind = flow.sources.includes(access) ? "read" : "write"
      const target = ConceptualLabeler.dataTarget(access.source)
      const id = `${kind}:${access.channel}:${target}`
      values.set(id, {
        kind,
        channel: access.channel,
        target,
        evidence: [access.nodeId],
      })
    }

    return [...values.values()].sort((left, right) =>
      `${left.kind}:${left.channel}:${left.target}`.localeCompare(
        `${right.kind}:${right.channel}:${right.target}`,
      ),
    )
  }

  private componentData(group: AnchorGroup, byId: Map<string, IrElement>): GeneratedDataAccess[] {
    const values = new Map<string, GeneratedDataAccess>()
    for (const id of [...group.reached.keys()].sort()) {
      const element = byId.get(id)
      if (element === undefined) continue
      for (const access of element.dataAccess) {
        const target = ConceptualLabeler.dataTarget(access.source)
        const key = `${access.kind}:${access.channel}:${target}`
        const existing = values.get(key)
        if (existing !== undefined) {
          existing.evidence = [...new Set([...existing.evidence, element.id])].sort()
          continue
        }
        values.set(key, {
          kind: access.kind,
          channel: access.channel,
          target,
          evidence: [element.id],
        })
      }
    }

    return [...values.values()].sort((left, right) =>
      `${left.kind}:${left.channel}:${left.target}`.localeCompare(
        `${right.kind}:${right.channel}:${right.target}`,
      ),
    )
  }

  private componentExternal(group: AnchorGroup, byId: Map<string, IrElement>): string[] {
    const values = new Set<string>()
    for (const id of group.reached.keys()) {
      const element = byId.get(id)
      if (element === undefined) continue
      for (const imported of element.imports) {
        if (!imported.external) continue
        const packageName = ConceptualLabeler.externalPackage(imported.specifier)
        if (packageName !== null) values.add(packageName)
      }
    }

    return [...values].sort()
  }

  private tests(
    group: AnchorGroup,
    byId: Map<string, IrElement>,
    relationships: IrRelationship[],
  ): string[] {
    const testIds = new Set(
      [...byId.values()]
        .filter((element) => element.type === "module" && TEST_PATH.test(element.filePath))
        .map((element) => element.id),
    )
    const values = new Set<string>()
    for (const relationship of relationships) {
      if (!testIds.has(relationship.sourceId)) continue
      if (relationship.resolution !== "resolved") continue
      if (!group.reached.has(relationship.targetId)) continue
      values.add(byId.get(relationship.sourceId)?.filePath ?? relationship.sourceId)
    }

    return [...values].sort()
  }

  private surface(entry: IrEntryPoint, byId: Map<string, IrElement>): string {
    const element = byId.get(entry.nodeId)
    if (entry.kind === "library_api") return element?.qualifiedName ?? entry.label
    return entry.label
  }

  private componentSummary(
    group: AnchorGroup,
    data: GeneratedDataAccess[],
    external: string[],
    tests: string[],
    files: number,
    symbols: number,
    unknowns: string[],
  ): string {
    const parts: string[] = []
    const surfaces = [...new Set(group.entries.map((entry) => entry.label))].sort()
    if (surfaces.length > 0) parts.push(`Observed entry points: ${surfaces.join(", ")}.`)
    const reads = [
      ...new Set(data.filter((item) => item.kind === "read").map((item) => item.channel)),
    ].sort()
    const writes = [
      ...new Set(data.filter((item) => item.kind === "write").map((item) => item.channel)),
    ].sort()
    if (reads.length > 0) parts.push(`Reads ${reads.join(", ")}.`)
    if (writes.length > 0) parts.push(`Writes ${writes.join(", ")}.`)
    if (external.length > 0) parts.push(`Uses external packages ${external.join(", ")}.`)
    if (tests.length > 0) parts.push(`Covered by ${tests.length} test modules.`)
    if (files > 0 || symbols > 0) {
      parts.push(`${files} files and ${symbols} symbols are mapped.`)
    }
    if (unknowns.length > 0) parts.push(`${unknowns.length} static unknowns were observed.`)

    return parts.length === 0 ? "No deterministic behavior was observed." : parts.join(" ")
  }

  private dataObservations(
    groups: AnchorGroup[],
    byId: Map<string, IrElement>,
    componentIds: Map<string, string>,
  ): DataObservation[] {
    const values = new Map<string, DataObservation>()
    for (const group of groups) {
      const componentId = componentIds.get(group.key) ?? ""
      for (const id of group.reached.keys()) {
        const element = byId.get(id)
        if (element === undefined) continue
        for (const access of element.dataAccess) {
          const target = ConceptualLabeler.dataTarget(access.source)
          const key = `${access.channel}:${target}`
          const existing = values.get(key)
          if (existing !== undefined) {
            existing.kinds.add(access.kind)
            existing.elementIds.add(element.id)
            existing.componentKeys.add(componentId)
            continue
          }
          values.set(key, {
            key,
            kinds: new Set([access.kind]),
            channel: access.channel,
            target,
            elementIds: new Set([element.id]),
            componentKeys: new Set([componentId]),
          })
        }
      }
    }

    return [...values.values()].sort((left, right) => left.key.localeCompare(right.key))
  }

  private externalObservations(
    groups: AnchorGroup[],
    byId: Map<string, IrElement>,
    componentIds: Map<string, string>,
  ): ExternalObservation[] {
    const values = new Map<string, ExternalObservation>()
    for (const group of groups) {
      const componentId = componentIds.get(group.key) ?? ""
      for (const id of group.reached.keys()) {
        const element = byId.get(id)
        if (element === undefined) continue
        for (const imported of element.imports) {
          if (!imported.external) continue
          const packageName = ConceptualLabeler.externalPackage(imported.specifier)
          if (packageName === null) continue
          const existing = values.get(packageName)
          if (existing !== undefined) {
            existing.elementIds.add(element.id)
            existing.componentKeys.add(componentId)
            continue
          }
          values.set(packageName, {
            packageName,
            elementIds: new Set([element.id]),
            componentKeys: new Set([componentId]),
          })
        }
      }
    }

    return [...values.values()].sort((left, right) =>
      left.packageName.localeCompare(right.packageName),
    )
  }

  private dataStores(values: DataObservation[]): GeneratedConceptualElement[] {
    return values.map((value) => {
      const label = ConceptualLabeler.label("DATA", `${value.channel}:${value.target}`)
      return {
        id: GeneratedSpecIdentity.dataStore(value.channel, value.target),
        type: "data_store" as const,
        label: label.label,
        label_role: label.role,
        label_anchor: label.anchor,
        label_evidence: [`${value.channel}:${value.target}`],
        parent_id:
          value.componentKeys.size === 0 ? null : ([...value.componentKeys].sort()[0] ?? null),
        summary: `Observed ${value.channel} data access to ${value.target}.`,
        confidence: "inferred",
        status: "inferred",
        provenance: "analysis:data-access",
        evidence: [...value.elementIds].sort(),
        entry_points: [],
        public_surface: [value.channel],
        data_access: [...value.kinds].sort().map((kind) => ({
          kind,
          channel: value.channel,
          target: value.target,
          evidence: [...value.elementIds].sort(),
        })),
        tests: [],
        unknowns: [],
      }
    })
  }

  private externalSystems(values: ExternalObservation[]): GeneratedConceptualElement[] {
    return values.map((value) => {
      const label = ConceptualLabeler.label("EXTERNAL", value.packageName)
      return {
        id: GeneratedSpecIdentity.externalSystem(value.packageName),
        type: "external_system" as const,
        label: label.label,
        label_role: label.role,
        label_anchor: label.anchor,
        label_evidence: [value.packageName],
        parent_id:
          value.componentKeys.size === 0 ? null : ([...value.componentKeys].sort()[0] ?? null),
        summary: `Imported by ${value.elementIds.size} modules.`,
        confidence: "observed",
        status: "observed",
        provenance: "analysis:external-import",
        evidence: [...value.elementIds].sort(),
        entry_points: [],
        public_surface: [value.packageName],
        data_access: [],
        tests: [],
        unknowns: [],
      }
    })
  }

  private mappings(
    groups: AnchorGroup[],
    componentIds: Map<string, string>,
    ownership: Map<string, Owner>,
    byId: Map<string, IrElement>,
    interfaces: GeneratedConceptualElement[],
    data: DataObservation[],
    externals: ExternalObservation[],
    entries: IrEntryPoint[],
    flowByEntry: Map<string, IrFlow>,
  ): GeneratedMapping[] {
    const values = new Map<string, GeneratedMapping>()
    const add = (mapping: GeneratedMapping): void => {
      values.set(mapping.id, mapping)
    }
    for (const group of groups) {
      const componentId = componentIds.get(group.key) ?? ""
      for (const [implementationId, owner] of ownership) {
        if (owner.componentKey !== group.key) continue
        const creating = group.entries.find((entry) => entry.nodeId === implementationId)
        const confidence =
          owner.ambiguous.size > 0
            ? "ambiguous"
            : owner.distance === 0
              ? (creating?.confidence ?? "observed")
              : "inferred"
        add({
          id: GeneratedSpecIdentity.mapping(componentId, implementationId),
          conceptual_id: componentId,
          implementation_id: implementationId,
          confidence,
          evidence: group.evidence,
          provenance: "analysis:behavior-reachability",
        })
      }
    }
    for (const entry of entries) {
      const element = byId.get(entry.nodeId)
      if (element === undefined) continue
      const owner = ownership.get(entry.nodeId)
      if (owner === undefined) continue
      const componentId = componentIds.get(owner.componentKey) ?? ""
      const interfaceId = GeneratedSpecIdentity.interface(entry.kind, entry.id)
      void componentId
      add({
        id: GeneratedSpecIdentity.mapping(interfaceId, element.id),
        conceptual_id: interfaceId,
        implementation_id: element.id,
        confidence: entry.confidence,
        evidence: [entry.id],
        provenance: "analysis:entry-surface",
      })
    }
    for (const item of data) {
      const dataId = GeneratedSpecIdentity.dataStore(item.channel, item.target)
      for (const elementId of [...item.elementIds].sort()) {
        add({
          id: GeneratedSpecIdentity.mapping(dataId, elementId),
          conceptual_id: dataId,
          implementation_id: elementId,
          confidence: "inferred",
          evidence: [`${item.channel}:${item.target}`],
          provenance: "analysis:data-access",
        })
      }
    }
    for (const item of externals) {
      const externalId = GeneratedSpecIdentity.externalSystem(item.packageName)
      for (const elementId of [...item.elementIds].sort()) {
        add({
          id: GeneratedSpecIdentity.mapping(externalId, elementId),
          conceptual_id: externalId,
          implementation_id: elementId,
          confidence: "observed",
          evidence: [item.packageName],
          provenance: "analysis:external-import",
        })
      }
    }
    void interfaces
    void flowByEntry

    return [...values.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private relationships(
    groups: AnchorGroup[],
    componentIds: Map<string, string>,
    ownership: Map<string, Owner>,
    interfaces: GeneratedConceptualElement[],
    data: DataObservation[],
    externals: ExternalObservation[],
    implementationRelationships: IrRelationship[],
  ): GeneratedRelationship[] {
    const values = new Map<string, GeneratedRelationship>()
    const add = (
      sourceId: string,
      targetId: string,
      type: string,
      confidence: GeneratedRelationship["confidence"],
      provenance: string,
    ): void => {
      if (sourceId === "" || targetId === "") return
      const id = GeneratedSpecIdentity.relationship(sourceId, type, targetId)
      if (values.has(id)) return
      values.set(id, {
        id,
        source_id: sourceId,
        target_id: targetId,
        type,
        resolution: "resolved",
        confidence,
        provenance,
      })
    }
    for (const item of interfaces) {
      if (item.parent_id !== null) {
        add(item.parent_id, item.id, "exposes", item.confidence, "analysis:entry-surface")
      }
    }
    for (const item of data) {
      const targetId = GeneratedSpecIdentity.dataStore(item.channel, item.target)
      for (const componentId of [...item.componentKeys].sort()) {
        for (const kind of [...item.kinds].sort()) {
          add(
            componentId,
            targetId,
            kind === "read" ? "reads" : "writes",
            "inferred",
            "analysis:data-access",
          )
        }
      }
    }
    for (const item of externals) {
      const targetId = GeneratedSpecIdentity.externalSystem(item.packageName)
      for (const componentId of [...item.componentKeys].sort()) {
        add(componentId, targetId, "uses_external", "observed", "analysis:external-import")
      }
    }
    for (const relationship of implementationRelationships) {
      if (!TRAVERSAL.has(relationship.type)) continue
      if (relationship.resolution !== "resolved") continue
      const sourceOwner = ownership.get(relationship.sourceId)
      const targetOwner = ownership.get(relationship.targetId)
      if (sourceOwner === undefined || targetOwner === undefined) continue
      if (sourceOwner.componentKey === targetOwner.componentKey) continue
      const sourceId = componentIds.get(sourceOwner.componentKey) ?? ""
      const targetId = componentIds.get(targetOwner.componentKey) ?? ""
      const type = relationship.type === "calls" ? "calls" : "depends_on"
      add(sourceId, targetId, type, relationship.confidence, "analysis:behavior-coupling")
    }
    void groups

    return [...values.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private coverage(
    groups: AnchorGroup[],
    componentIds: Map<string, string>,
    ownership: Map<string, Owner>,
    implementation: GeneratedImplementation,
    entries: IrEntryPoint[],
    flowByEntry: Map<string, IrFlow>,
    externalSystems: GeneratedConceptualElement[],
  ): GeneratedCoverage {
    const mappedKeys = new Set([...ownership.values()].map((owner) => owner.componentKey))
    const componentValues = groups.map((group) => ({
      key: group.key,
      id: componentIds.get(group.key) ?? "",
    }))
    const mapped = componentValues
      .filter((value) => value.id !== "" && mappedKeys.has(value.key))
      .map((value) => value.id)
      .sort()
    const unmapped = componentValues
      .filter((value) => value.id !== "" && !mappedKeys.has(value.key))
      .map((value) => value.id)
      .sort()
    const ambiguous = [...ownership.entries()]
      .filter(([, owner]) => owner.ambiguous.size > 0)
      .map(([id]) => id)
      .sort()
    const partial = componentValues
      .filter((value) =>
        [...ownership.values()].some(
          (owner) => owner.componentKey === value.key && owner.ambiguous.size > 0,
        ),
      )
      .map((value) => value.id)
      .filter((id) => id !== "")
      .sort()
    const unassigned = implementation.files
      .filter((file) => !TEST_PATH.test(file.path))
      .filter((file) => !ownership.has(file.id))
      .map((file) => file.id)
      .sort()
    const withoutSinks = entries
      .filter((entry) => {
        const flow = flowByEntry.get(entry.id)
        return flow !== undefined && flow.sinks.length === 0
      })
      .map((entry) => entry.id)
      .sort()
    const withoutImplementation = entries
      .filter((entry) => !ownership.has(entry.nodeId))
      .map((entry) => entry.id)
      .sort()

    return {
      mapped: [...new Set(mapped)],
      partial: [...new Set(partial)],
      unmapped: [...new Set(unmapped)],
      unassigned,
      stale: [],
      ambiguous,
      entry_points_without_sinks: withoutSinks,
      behavior_without_implementation: withoutImplementation,
      external_systems: externalSystems.map((element) => element.id).sort(),
    }
  }
}
