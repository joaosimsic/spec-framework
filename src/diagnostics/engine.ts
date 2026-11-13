import type { IrElement, IrEntryPoint, IrFinding, IrRelationship } from "../analysis/ir"
import type { GeneratedConceptualElement, GeneratedCoverage } from "../spec"
import type { DiagnosticsConfig } from "./config"
import { DEFAULT_DIAGNOSTICS } from "./config"

export interface DiagnosticsInput {
  elements: IrElement[]
  relationships: IrRelationship[]
  entryPoints: IrEntryPoint[]
  coverage: GeneratedCoverage
  components?: GeneratedConceptualElement[]
  config?: DiagnosticsConfig
}

export class DiagnosticsEngine {
  private readonly findings = new Map<string, IrFinding>()

  run(input: DiagnosticsInput): IrFinding[] {
    const config = input.config ?? DEFAULT_DIAGNOSTICS
    this.cycles(input.elements, input.relationships)
    this.fan(input.elements, input.relationships, config)
    this.large(input.elements, config)
    this.unused(input.elements, input.relationships, input.entryPoints)
    this.directions(input.elements, input.relationships, config)
    this.coverage(input.coverage)
    this.missingTests(input)

    return [...this.findings.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private cycles(elements: IrElement[], relationships: IrRelationship[]): void {
    const modules = new Set(
      elements.filter((element) => element.type === "module").map((element) => element.id),
    )
    const dependencies = new Map<string, string[]>()
    for (const relationship of relationships) {
      if (relationship.type !== "imports") continue
      if (!modules.has(relationship.sourceId) || !modules.has(relationship.targetId)) continue
      const targets = dependencies.get(relationship.sourceId) ?? []
      targets.push(relationship.targetId)
      dependencies.set(relationship.sourceId, [...new Set(targets)].sort())
    }
    const seen = new Set<string>()

    for (const start of [...modules].sort()) {
      const queue = (dependencies.get(start) ?? []).map((id) => [start, id])
      for (let index = 0; index < queue.length && index < 200; index++) {
        const path = queue[index]
        if (path === undefined) continue
        const current = path.at(-1)
        if (current === undefined) continue
        if (current === start && path.length > 1) {
          const key = [...new Set(path)].sort().join("|")
          if (seen.has(key) || path.slice(0, -1).some((id) => id < start)) continue
          seen.add(key)
          this.add(
            "ARC-001",
            "Circular module dependency",
            [...new Set(path)],
            path.slice(1).map((id) => ({
              kind: "edge",
              reference: `${path[0]} -> ${id}`,
              file: this.fileOf(elements, id),
              line: 1,
            })),
            "A dependency cycle exists between these modules.",
            "Introduce a shared boundary or invert one dependency.",
          )
          continue
        }
        for (const next of dependencies.get(current) ?? []) {
          if (path.includes(next) && next !== start) continue
          queue.push([...path, next])
        }
      }
    }
  }

  private fan(
    elements: IrElement[],
    relationships: IrRelationship[],
    config: DiagnosticsConfig,
  ): void {
    const incoming = new Map<string, number>()
    const outgoing = new Map<string, number>()
    for (const relationship of relationships) {
      if (relationship.type === "contains") continue
      outgoing.set(relationship.sourceId, (outgoing.get(relationship.sourceId) ?? 0) + 1)
      incoming.set(relationship.targetId, (incoming.get(relationship.targetId) ?? 0) + 1)
    }
    for (const element of elements) {
      const fanIn = incoming.get(element.id) ?? 0
      const fanOut = outgoing.get(element.id) ?? 0
      if (fanIn > config.fanInThreshold) {
        this.add(
          "ARC-002",
          "High fan-in",
          [element.id],
          [
            {
              kind: "metric",
              reference: `${fanIn} incoming relationships`,
              file: element.filePath,
              line: element.startLine,
            },
          ],
          `${element.name} has ${fanIn} incoming dependencies.`,
          "Review whether the module has too many responsibilities.",
        )
      }
      if (fanOut > config.fanOutThreshold) {
        this.add(
          "ARC-003",
          "High fan-out",
          [element.id],
          [
            {
              kind: "metric",
              reference: `${fanOut} outgoing relationships`,
              file: element.filePath,
              line: element.startLine,
            },
          ],
          `${element.name} has ${fanOut} outgoing dependencies.`,
          "Review whether the module should be split or its dependencies narrowed.",
        )
      }
    }
  }

  private large(elements: IrElement[], config: DiagnosticsConfig): void {
    for (const element of elements) {
      if (element.type !== "module") continue
      const symbols = elements.filter(
        (candidate) => candidate.filePath === element.filePath && candidate.type !== "module",
      ).length
      const lines = element.endLine - element.startLine + 1
      if (symbols <= config.maxSymbols && lines <= config.maxLines) continue
      this.add(
        "ARC-004",
        "Large component",
        [element.id],
        [
          {
            kind: "metric",
            reference: `${symbols} symbols, ${lines} lines`,
            file: element.filePath,
            line: element.startLine,
          },
        ],
        `${element.name} is larger than the configured component budget.`,
        "Consider splitting the file along responsibility boundaries.",
      )
    }
  }

  private unused(
    elements: IrElement[],
    relationships: IrRelationship[],
    entryPoints: IrEntryPoint[],
  ): void {
    const referenced = new Set(
      relationships
        .filter((relationship) =>
          ["calls", "references", "imports", "implements", "inherits"].includes(relationship.type),
        )
        .map((relationship) => relationship.targetId),
    )
    const entries = new Set(entryPoints.map((entry) => entry.nodeId))
    for (const element of elements) {
      if (element.type === "module" || element.exported || entries.has(element.id)) continue
      if (["method", "property"].includes(element.type) || element.name === "constructor") continue
      if (referenced.has(element.id) || element.id.startsWith("FILE-")) continue
      this.add(
        "ARC-007",
        "Unused code",
        [element.id],
        [
          {
            kind: "reference",
            reference: element.qualifiedName,
            file: element.filePath,
            line: element.startLine,
          },
        ],
        `${element.name} has no incoming references in the analyzed snapshot.`,
        "Remove the symbol or mark it as an intentional entry point.",
      )
    }
  }

  private directions(
    elements: IrElement[],
    relationships: IrRelationship[],
    config: DiagnosticsConfig,
  ): void {
    for (const relationship of relationships) {
      const source = elements.find((element) => element.id === relationship.sourceId)
      const target = elements.find((element) => element.id === relationship.targetId)
      if (source === undefined || target === undefined) continue
      for (const boundary of config.boundaries) {
        if (!this.glob(boundary.from, source.filePath)) continue
        if (!boundary.forbid.some((pattern) => this.glob(pattern, target.filePath))) continue
        this.add(
          "ARC-008",
          "Dependency direction violation",
          [source.id, target.id],
          [
            {
              kind: "edge",
              reference: relationship.id,
              file: source.filePath,
              line: source.startLine,
            },
          ],
          `${source.filePath} depends on forbidden boundary ${target.filePath}.`,
          "Move the shared contract to an allowed layer or remove the dependency.",
        )
      }
    }
  }

  private coverage(coverage: GeneratedCoverage): void {
    for (const element of coverage.unmapped) {
      this.add(
        "ARC-012",
        "Unclear architectural ownership",
        [element],
        [
          {
            kind: "coverage",
            reference: element,
            file: "spec/generated/spec.gen.json",
            line: 1,
          },
        ],
        `${element} has no resolved implementation mapping.`,
        "Review behavior anchors and implementation reachability, then add or correct evidence for this conceptual element.",
      )
    }
  }

  private missingTests(input: DiagnosticsInput): void {
    const mapped = new Set(input.coverage.mapped)
    for (const component of input.components ?? []) {
      if (!mapped.has(component.id)) continue
      if (component.entry_points.length === 0 && component.public_surface.length === 0) continue
      if (component.tests.length > 0) continue
      this.add(
        "ARC-011",
        "Missing test coverage",
        [component.id],
        [
          {
            kind: "coverage",
            reference: component.id,
            file: "spec/generated/spec.gen.json",
            line: 1,
          },
        ],
        `${component.label} has observed behavior but no test evidence in this snapshot.`,
        "Add a test that reaches this component or record the coverage gap as unknown.",
      )
    }
  }

  private add(
    ruleId: string,
    title: string,
    affected: string[],
    evidence: IrFinding["evidence"],
    explanation: string,
    recommendation: string,
  ): void {
    const id = `FIND-${ruleId}-${affected.join("|")}`
    if (this.findings.has(id) || evidence.length === 0) return
    this.findings.set(id, {
      id,
      ruleId,
      family: "deterministic",
      title,
      severity: "warning",
      status: "open",
      affectedElements: affected,
      evidence,
      explanation,
      recommendation,
      confidence: 1,
    })
  }

  private fileOf(elements: IrElement[], id: string): string {
    return elements.find((element) => element.id === id)?.filePath ?? ""
  }

  private glob(pattern: string, path: string): boolean {
    const source = pattern
      .split("**")
      .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*"))
      .join(".*")

    return new RegExp(`^${source}$`).test(path)
  }
}
