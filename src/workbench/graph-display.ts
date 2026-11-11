import type { CheckResult, Diagnostic } from "../core/types"
import type { Result } from "../core/result"
import {
  DisplayProjection,
  type DisplayEntry,
  type DisplayFailure,
  type DisplayReference,
} from "../model"
import type { SpecGraph } from "../model/types"
import { WorkbenchLabeler } from "./labels"
import type {
  WorkbenchCheckFinding,
  WorkbenchCheckView,
  WorkbenchContextView,
  WorkbenchGraphView,
  WorkbenchNamedItem,
  WorkbenchProposalSummary,
} from "./types"

const INTERNAL_ID = /\b(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS|MOD|IFACE|ENT|TERM|ONT|CS|SEM)-[A-Z0-9][A-Z0-9-]*\b/g

export class WorkbenchGraphDisplay {
  private readonly projection: DisplayProjection
  readonly labels: WorkbenchLabeler

  constructor(private readonly graph: SpecGraph) {
    this.projection = new DisplayProjection(graph)
    this.labels = new WorkbenchLabeler(graph, this.projection)
  }

  resolveHandle(handle: string): Result<string, DisplayFailure> {
    const [entry, error] = this.projection.resolve(handle)
    if (error !== null) return [null, error]
    if (entry === null) {
      return [null, { code: "DISPLAY-NOT-FOUND", message: `unknown item: ${handle}` }]
    }

    return [entry.technical.id, null]
  }

  view(): WorkbenchGraphView {
    return {
      commit: this.graph.commit,
      dirty: this.graph.dirty,
      entries: this.projection.model.entries,
    }
  }

  context(
    proposal: WorkbenchProposalSummary | null,
    names: string[] | undefined,
    prompts: string[],
    next: string[],
  ): Result<WorkbenchContextView, DisplayFailure> {
    const [entries, entriesError] = this.entries(names)
    if (entriesError !== null) return [null, entriesError]

    const resolvedEntries = entries ?? []
    return [
      {
        proposal,
        entries: resolvedEntries,
        blockers: this.blockers(resolvedEntries),
        openQuestions: this.openQuestions(resolvedEntries),
        prompts: [...prompts],
        next: [...next],
      },
      null,
    ]
  }

  check(result: CheckResult): WorkbenchCheckView {
    return {
      errors: result.errors,
      warnings: result.warnings,
      findings: result.diagnostics.map((diagnostic) => this.finding(diagnostic)),
    }
  }

  private entries(names: string[] | undefined): Result<DisplayEntry[], DisplayFailure> {
    if (names === undefined || names.length === 0) return [this.projection.model.entries, null]

    const entries = new Map<string, DisplayEntry>()
    for (const name of names) {
      const [entry, error] = this.projection.resolve(name)
      if (error !== null) return [null, error]
      if (entry === null) continue
      entries.set(entry.ref, entry)
    }

    return [[...entries.values()], null]
  }

  private blockers(entries: DisplayEntry[]): string[] {
    return [...new Set(entries.flatMap((entry) => entry.blockers))].sort()
  }

  private openQuestions(entries: DisplayEntry[]): WorkbenchNamedItem[] {
    const questions = new Map<string, WorkbenchNamedItem>()

    for (const entry of entries) {
      for (const question of entry.openQuestions) {
        questions.set(question.ref, this.named(question))
      }
    }

    return [...questions.values()]
  }

  private named(reference: DisplayReference): WorkbenchNamedItem {
    return {
      ref: reference.ref,
      label: reference.label,
      kindLabel: reference.kindLabel,
    }
  }

  private finding(diagnostic: Diagnostic): WorkbenchCheckFinding {
    return {
      level: diagnostic.level,
      message: this.humanMessage(diagnostic),
    }
  }

  private humanMessage(diagnostic: Diagnostic): string {
    let message = diagnostic.message

    for (const element of this.graph.elements) {
      if (message.includes(element.id)) {
        message = message.replaceAll(element.id, this.labels.named(element.id).label)
      }
    }

    return message.replace(INTERNAL_ID, "linked item")
  }
}
