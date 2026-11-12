import type { ProposalGit } from "../change/change"
import { GitProposalRepository } from "../change/git"
import { ProposalStore } from "../change/store"
import type { Proposal, ProposalOperationLog } from "../change/types"
import { ArchitectureEditor } from "../change/architecture-editor"
import { attemptAsync, type Result } from "../core/result"
import { MappingCurationEngine } from "./curation"
import type { MappingCurationRelation, MappingCurationState } from "./curation-types"
import { MappingSnapshotStore } from "./mapping-store"
import type { DraftElement } from "./types"

export interface PromotionOptions {
  scopes?: string[]
  technical?: boolean
  now?: () => Date
  gitRepository?: ProposalGit
}

export interface PromotedArea {
  id: string
  label: string
}

export interface PromotionReport {
  proposal: Proposal
  promoted: PromotedArea[]
  skipped: PromotedArea[]
  relations: number
  questions: string[]
  files: string[]
}

export type PromotionFailure = { code: string; message: string }

export class MappingPromoter {
  constructor(private readonly target: string) {}

  async promote(
    options: PromotionOptions = {},
  ): Promise<Result<PromotionReport, PromotionFailure>> {
    const git = options.gitRepository ?? new GitProposalRepository()
    const [state, stateError] = await git.readState(this.target)
    if (stateError !== null) return [null, this.failure("PROMOTE-GIT", stateError)]
    if (state === null)
      return [null, this.failure("PROMOTE-GIT", "workspace reader returned no state")]

    const [proposal, proposalError] = await new ProposalStore(this.target).loadForBranch(
      state.branch,
    )
    if (proposalError !== null) return [null, this.failure("PROMOTE-PROPOSAL", proposalError)]
    if (proposal === null) return [null, this.failure("PROMOTE-PROPOSAL", "no active proposal")]
    if (proposal.mode !== "mapping") {
      return [null, this.failure("PROMOTE-MODE", "active proposal is not a mapping review")]
    }
    if (proposal.status === "approved" || proposal.status === "superseded") {
      return [null, this.failure("PROMOTE-MODE", "active proposal is not editable")]
    }

    const [snapshot, snapshotError] = await new MappingSnapshotStore(this.target).load(
      proposal.branch,
    )
    if (snapshotError !== null) return [null, this.failure("PROMOTE-SNAPSHOT", snapshotError)]
    if (snapshot === null) return [null, this.failure("PROMOTE-SNAPSHOT", "snapshot not found")]

    const [engine, replayError] = MappingCurationEngine.replay(
      snapshot.map,
      snapshot.decisions,
      proposal.author,
    )
    if (replayError !== null) return [null, this.failure("PROMOTE-REPLAY", replayError)]
    if (engine === null) return [null, this.failure("PROMOTE-REPLAY", "curation replay failed")]

    const stateView = engine.state()
    const [areas, areaError] = this.selectAreas(stateView, options.scopes ?? [])
    if (areaError !== null) return [null, areaError]
    if (areas === null) return [null, this.failure("PROMOTE-SCOPE", "area selection failed")]

    const [relations, relationError] = this.selectRelations(stateView, areas)
    if (relationError !== null) return [null, relationError]
    if (relations === null)
      return [null, this.failure("PROMOTE-RELATION", "relation selection failed")]

    const [editor, editorError] = await ArchitectureEditor.load(this.target)
    if (editorError !== null) return [null, this.failure("PROMOTE-ARCHITECTURE", editorError)]
    if (editor === null) {
      return [null, this.failure("PROMOTE-ARCHITECTURE", "architecture editor returned no result")]
    }
    const [hasModel, modelError] = this.requireModel(editor)
    if (modelError !== null) return [null, modelError]
    if (!hasModel) {
      return [null, this.failure("PROMOTE-ARCHITECTURE", "spec/architecture/model.c4 is required")]
    }

    const before = this.hashes(editor, areas)
    const [written, skipped, writeError] = await this.writeAreas(editor, areas)
    if (writeError !== null) return [null, writeError]
    if (written === null || skipped === null) {
      return [null, this.failure("PROMOTE-ARCHITECTURE", "area write returned no result")]
    }

    const [relationCount, relationWriteError] = this.writeRelations(editor, relations)
    if (relationWriteError !== null) return [null, relationWriteError]
    if (relationCount === null) {
      return [null, this.failure("PROMOTE-RELATION", "relation write returned no result")]
    }

    const [files, filesError] = await this.save(editor)
    if (filesError !== null) return [null, filesError]
    if (files === null) return [null, this.failure("PROMOTE-WRITE", "file save returned no result")]

    const after = this.hashes(editor, areas)
    const timestamp = (options.now ?? (() => new Date()))().toISOString()
    const operation: ProposalOperationLog = {
      kind: "promote-mapping",
      at: timestamp,
      targets: areas.map((area) => area.id),
      before_hashes: before,
      after_hashes: after,
    }
    proposal.operations.push(operation)
    proposal.status = "proposed"
    const [, saveError] = await new ProposalStore(this.target).save(proposal)
    if (saveError !== null) return [null, this.failure("PROMOTE-PROPOSAL", saveError)]

    return [
      {
        proposal,
        promoted: written,
        skipped,
        relations: relationCount,
        questions: stateView.questions
          .filter((question) => areas.some((area) => area.id === question.targetId))
          .map((question) => question.question),
        files,
      },
      null,
    ]
  }

  private selectAreas(
    state: MappingCurationState,
    scopes: string[],
  ): Result<DraftElement[], PromotionFailure> {
    const byId = new Map(state.areas.map((area) => [area.id, area]))
    const selected = new Map<string, DraftElement>()

    if (scopes.length === 0) {
      for (const id of state.resolvedIds) {
        const area = byId.get(id)
        if (area !== undefined) selected.set(id, area)
      }
    }

    for (const scope of scopes) {
      const [area, scopeError] = this.resolveArea(state.areas, scope)
      if (scopeError !== null) return [null, scopeError]
      if (area === null) {
        return [null, this.failure("PROMOTE-SCOPE", `unknown mapping area: ${scope}`)]
      }
      selected.set(area.id, area)
    }

    if (selected.size === 0) {
      return [
        null,
        this.failure(
          "PROMOTE-SCOPE",
          "no accepted areas to promote; curate the mapping review first",
        ),
      ]
    }

    for (const area of selected.values()) {
      if (!state.resolvedIds.includes(area.id)) {
        return [null, this.failure("PROMOTE-SCOPE", `'${area.title}' is not accepted yet`)]
      }
      const blocking = state.questions.find(
        (question) => question.blocking && question.targetId === area.id,
      )
      if (blocking !== undefined) {
        return [
          null,
          this.failure(
            "PROMOTE-BLOCKED",
            `'${area.title}' is blocked by an open question: ${blocking.question}`,
          ),
        ]
      }
    }

    return [[...selected.values()].sort((left, right) => left.id.localeCompare(right.id)), null]
  }

  private selectRelations(
    state: MappingCurationState,
    areas: DraftElement[],
  ): Result<MappingCurationRelation[], PromotionFailure> {
    const ids = new Set(areas.map((area) => area.id))
    const relations = state.relations.filter(
      (relation) =>
        ids.has(relation.sourceId) &&
        ids.has(relation.targetId) &&
        relation.confidence === "observed",
    )

    return [relations, null]
  }

  private resolveArea(
    areas: DraftElement[],
    scope: string,
  ): Result<DraftElement | null, PromotionFailure> {
    const exact = areas.find((area) => area.id === scope)
    if (exact !== undefined) return [exact, null]

    const normalized = scope.trim().toLowerCase()
    const matches = areas.filter((area) => area.title.trim().toLowerCase() === normalized)
    if (matches.length > 1) {
      return [null, this.failure("PROMOTE-SCOPE", `mapping area name '${scope}' is ambiguous`)]
    }

    return [matches[0] ?? null, null]
  }

  private requireModel(editor: ArchitectureEditor): Result<boolean, PromotionFailure> {
    const found = editor.files().some((file) => file.path.endsWith("model.c4"))

    return [found, null]
  }

  private async writeAreas(
    editor: ArchitectureEditor,
    areas: DraftElement[],
  ): Promise<[PromotedArea[], PromotedArea[], PromotionFailure | null]> {
    const promoted: PromotedArea[] = []
    const skipped: PromotedArea[] = []

    for (const area of areas) {
      const item = { id: area.id, label: area.title }
      if (editor.hasElement(area.id)) {
        skipped.push(item)
        continue
      }

      const [, kindError] = editor.ensureElementKind(area.kind)
      if (kindError !== null) return [[], [], this.failure("PROMOTE-ARCHITECTURE", kindError)]

      const [, addError] = editor.addElement(area.id, area.title, area.kind)
      if (addError !== null) return [[], [], this.failure("PROMOTE-ARCHITECTURE", addError)]

      const [, annotationError] = editor.setAnnotation(area.id, {
        status: "proposed",
        confidence: "observed",
        provenance: area.provenance,
        metadata: this.metadata(area),
      })
      if (annotationError !== null) {
        return [[], [], this.failure("PROMOTE-ARCHITECTURE", annotationError)]
      }
      promoted.push(item)
    }

    return [promoted, skipped, null]
  }

  private writeRelations(
    editor: ArchitectureEditor,
    relations: MappingCurationRelation[],
  ): Result<number, PromotionFailure> {
    let count = 0
    for (const relation of relations) {
      const [, error] = editor.addRelation(relation.sourceId, relation.targetId, relation.type)
      if (error !== null) return [null, this.failure("PROMOTE-ARCHITECTURE", error)]
      count += 1
    }

    return [count, null]
  }

  private async save(editor: ArchitectureEditor): Promise<Result<string[], PromotionFailure>> {
    const written: string[] = []
    for (const file of editor.files()) {
      if (!file.changed) continue
      const [, writeError] = await attemptAsync(() => Bun.write(file.path, file.text))
      if (writeError !== null) {
        return [null, this.failure("PROMOTE-WRITE", `cannot write ${file.path}: ${writeError}`)]
      }
      written.push(file.path)
    }

    return [written, null]
  }

  private hashes(editor: ArchitectureEditor, areas: DraftElement[]): Record<string, string | null> {
    return Object.fromEntries(areas.map((area) => [area.id, editor.hashFor(area.id)]))
  }

  private metadata(area: DraftElement): Record<string, string> {
    const metadata: Record<string, string> = {}
    if (area.owner !== undefined) metadata.owner = area.owner
    if (area.responsibility !== undefined) metadata.responsibility = area.responsibility
    if (area.boundary !== undefined) metadata.boundary = area.boundary

    return metadata
  }

  private failure(code: string, message: string): PromotionFailure {
    return { code, message }
  }
}
