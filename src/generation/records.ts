import { join } from "node:path"
import { attemptAsync } from "../core/result"
import type { IrElement, IrEntryPoint, IrFlow, IrFinding } from "../analysis/ir"
import type { SpecFrameworkConfig } from "../config"
import {
  GeneratedSpecIdentity,
  type GeneratedBehaviorRecord,
  type GeneratedContractRecord,
  type GeneratedEvidence,
  type GeneratedUnknown,
  type GeneratedVerificationRecord,
} from "../spec"
import type { SystemProjection } from "../implementation"
import { GeneratedEvidenceFactory } from "./evidence"

export class GeneratedRecordFactory {
  constructor(
    private readonly root: string,
    private readonly config: SpecFrameworkConfig,
  ) {}

  behavior(
    elements: IrElement[],
    entryPoints: IrEntryPoint[],
    flows: IrFlow[],
    projection: SystemProjection,
  ): { records: GeneratedBehaviorRecord[]; evidence: GeneratedEvidence[] } {
    const evidence: GeneratedEvidence[] = []
    const records: GeneratedBehaviorRecord[] = entryPoints.map((entry) => {
      const item = GeneratedEvidenceFactory.fromProvenance(entry.provenance, entry.label)
      evidence.push(item)
      const component = this.componentOf(entry.nodeId, projection)
      const flow = flows.find((candidate) => candidate.entryPointId === entry.id)
      const source = elements.find((element) => element.id === entry.nodeId)
      const title = `${entry.kind.replaceAll("_", " ")} ${entry.label}`

      return {
        id: GeneratedSpecIdentity.behavior(entry.id),
        kind: "observed_behavior" as const,
        title,
        statement: this.statement(entry, source, flow),
        component,
        entry_point: entry.id,
        evidence: [item.id],
        confidence: entry.confidence,
        status: entry.confidence,
        unknowns: flow?.unknowns ?? [],
      }
    })

    return { records, evidence }
  }

  async contracts(
    elements: IrElement[],
  ): Promise<{ records: GeneratedContractRecord[]; evidence: GeneratedEvidence[] }> {
    const evidence: GeneratedEvidence[] = []
    const records: GeneratedContractRecord[] = []
    const packagePath = join(this.root, "package.json")
    const [text] = await attemptAsync(() => Bun.file(packagePath).text())
    if (text !== null) {
      const [parsed] = await attemptAsync(async () => JSON.parse(text) as Record<string, unknown>)
      if (parsed !== null) records.push(...this.packageContracts(parsed, evidence))
    }
    const exported = elements.filter(
      (element) => element.exported && ["function", "class", "interface"].includes(element.type),
    )
    if (exported.length > 0) {
      const item = GeneratedEvidenceFactory.fromProvenance(
        exported[0]?.provenance ?? "",
        "exported surface",
      )
      evidence.push(item)
      records.push({
        id: GeneratedSpecIdentity.contract(
          `library:${exported
            .map((element) => element.id)
            .sort()
            .join(",")}`,
        ),
        kind: "library_api",
        title: "Exported library surface",
        owner: null,
        surface: exported.map((element) => element.qualifiedName).sort(),
        evidence: [item.id],
        confidence: "observed",
        status: "observed",
      })
    }

    return { records, evidence }
  }

  verification(elements: IrElement[]): {
    records: GeneratedVerificationRecord[]
    evidence: GeneratedEvidence[]
  } {
    const evidence: GeneratedEvidence[] = []
    const testModules = elements.filter(
      (element) =>
        element.type === "module" && /(?:^tests?\/|\.test\.|\.spec\.)/.test(element.filePath),
    )
    const records: GeneratedVerificationRecord[] = testModules.map((element) => {
      const item = GeneratedEvidenceFactory.fromProvenance(element.provenance, element.filePath)
      evidence.push(item)
      return {
        id: GeneratedSpecIdentity.verification(`test:${element.filePath}`),
        method: "test" as const,
        title: element.filePath,
        target: element.filePath,
        result: "unknown" as const,
        evidence: [item.id],
        confidence: "observed" as const,
        status: "observed" as const,
      }
    })
    for (const check of this.config.checks) {
      const item = GeneratedEvidenceFactory.fromProvenance("spec-framework.json:1", check.id)
      evidence.push(item)
      records.push({
        id: GeneratedSpecIdentity.verification(`check:${check.id}`),
        method:
          check.kind === "typecheck" ? "compiler" : check.kind === "test" ? "test" : "external",
        title: check.id,
        target: check.command.join(" "),
        result: "unknown",
        evidence: [item.id],
        confidence: "observed",
        status: "observed",
      })
    }

    return { records, evidence }
  }

  unknowns(findings: IrFinding[], flows: IrFlow[]): GeneratedUnknown[] {
    const values = new Map<string, GeneratedUnknown>()
    for (const finding of findings) {
      if (finding.ruleId !== "IR-UNRESOLVED-CALL") continue
      const reason = finding.title
      const source = finding.evidence[0]?.reference ?? finding.affectedElements[0] ?? ""
      const id = GeneratedSpecIdentity.unknown(`${source}:${reason}`)
      values.set(id, { id, reason, source, confidence: "unknown" })
    }
    for (const flow of flows) {
      for (const unknown of flow.unknowns) {
        const id = GeneratedSpecIdentity.unknown(`${flow.id}:${unknown}`)
        values.set(id, { id, reason: unknown, source: flow.id, confidence: "ambiguous" })
      }
    }

    return [...values.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private packageContracts(
    packageJson: Record<string, unknown>,
    evidence: GeneratedEvidence[],
  ): GeneratedContractRecord[] {
    const records: GeneratedContractRecord[] = []
    const item = GeneratedEvidenceFactory.fromProvenance("package.json:1", "package manifest")
    evidence.push(item)
    const bin = packageJson["bin"]
    if (
      typeof bin === "string" ||
      (typeof bin === "object" && bin !== null && !Array.isArray(bin))
    ) {
      const surface =
        typeof bin === "string"
          ? [bin]
          : Object.entries(bin as Record<string, unknown>).flatMap(([key, value]) =>
              typeof value === "string" ? [`${key}:${value}`] : [],
            )
      records.push({
        id: GeneratedSpecIdentity.contract("package:bin"),
        kind: "cli",
        title: "CLI commands",
        owner: "package.json",
        surface,
        evidence: [item.id],
        confidence: "observed",
        status: "observed",
      })
    }
    const exportsValue = packageJson["exports"]
    if (exportsValue !== undefined) {
      records.push({
        id: GeneratedSpecIdentity.contract("package:exports"),
        kind: "package_exports",
        title: "Package exports",
        owner: "package.json",
        surface: this.surface(exportsValue),
        evidence: [item.id],
        confidence: "observed",
        status: "observed",
      })
    }

    return records
  }

  private surface(value: unknown): string[] {
    if (typeof value === "string") return [value]
    if (typeof value !== "object" || value === null || Array.isArray(value)) return []
    return Object.entries(value).flatMap(([key, entry]) => [key, ...this.surface(entry)])
  }

  private componentOf(nodeId: string, projection: SystemProjection): string | null {
    const byId = new Map(projection.nodes.map((node) => [node.id, node]))
    let current = byId.get(nodeId)
    const seen = new Set<string>()
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.kind === "component" || current.kind === "subsystem") return current.id
      current = current.parentId === null ? undefined : byId.get(current.parentId)
    }

    return null
  }

  private statement(
    entry: IrEntryPoint,
    element: IrElement | undefined,
    flow: IrFlow | undefined,
  ): string {
    const source =
      element === undefined ? entry.label : `${element.qualifiedName} in ${element.filePath}`
    const sinks = flow?.sinks.length ?? 0
    const suffix =
      sinks === 0 ? " No static sink was observed." : ` ${sinks} static sink(s) were observed.`

    return `${source} is reachable through ${entry.kind}.${suffix}`
  }
}
