import { elementContentHash } from "../approval/hash"
import { loadRequirementSources } from "../core/requirements"
import type { Result } from "../core/result"
import type { SdocBlock } from "../core/types"
import { SdocDocument } from "./sdoc-editor"
import type {
  ChangeAction,
  ChangeEntry,
  ProposalOperation,
  ProposalOperationKind,
  ProposalOperationLog,
  ProposalRecordFields,
} from "./types"

const KIND_BY_PREFIX: Record<string, string> = {
  REQ: "requirement",
  AC: "acceptance_criterion",
  CMP: "component",
  CAP: "capability",
  VOBJ: "verification_objective",
  VER: "verification_case",
  PROP: "formal_property",
  CON: "contract",
  EVD: "evidence",
  UNK: "unknown",
  WVR: "waiver",
  DEC: "decision",
}

export interface OperationApplication {
  logs: ProposalOperationLog[]
  changes: ChangeEntry[]
}

export class SdocOperationApplier {
  private readonly documents = new Map<string, SdocDocument>()
  private readonly pathsByUid = new Map<string, string>()
  private readonly changes = new Map<string, ChangeEntry>()

  constructor(
    private readonly target: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async apply(operations: ProposalOperation[]): Promise<Result<OperationApplication, string>> {
    const [loaded, loadError] = await this.loadDocuments()
    if (loadError !== null) return [null, loadError]
    if (!loaded) return [null, "requirement documents failed to load"]

    const logs: ProposalOperationLog[] = []
    for (const operation of operations) {
      const [log, operationError] = await this.applyOperation(operation)
      if (operationError !== null) return [null, operationError]
      if (log === null) return [null, "operation produced no log"]
      logs.push(log)
    }

    const [saved, saveError] = await this.saveDocuments()
    if (saveError !== null) return [null, saveError]
    if (!saved) return [null, "documents failed to save"]

    return [
      {
        logs,
        changes: [...this.changes.values()].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
      },
      null,
    ]
  }

  private async loadDocuments(): Promise<Result<boolean, string>> {
    const sources = await loadRequirementSources(this.target)
    const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
    if (sourceErrors.length > 0) {
      return [null, sourceErrors.map((item) => item.message).join("\n")]
    }

    for (const file of sources.files) {
      const [document, documentError] = await SdocDocument.load(file)
      if (documentError !== null) return [null, documentError]
      if (document === null) return [null, `cannot load ${file}`]
      this.documents.set(file, document)
    }

    for (const block of sources.blocks) {
      const uid = block.fields.UID
      if (uid === undefined || uid === "") continue
      if (this.pathsByUid.has(uid)) return [null, `duplicate element ID '${uid}'`]
      this.pathsByUid.set(uid, block.file)
    }

    return [true, null]
  }

  private async applyOperation(
    operation: ProposalOperation,
  ): Promise<Result<ProposalOperationLog, string>> {
    const targets = this.targetsFor(operation)
    const beforeHashes = this.hashesFor(this.idsFor(operation))
    const [applied, applyError] = this.applyOne(operation)
    if (applyError !== null) return [null, applyError]
    if (!applied) return [null, "operation did not apply"]

    return [
      {
        kind: operation.kind,
        at: this.now().toISOString(),
        targets,
        before_hashes: beforeHashes,
        after_hashes: this.hashesFor(this.idsFor(operation)),
      },
      null,
    ]
  }

  private applyOne(operation: ProposalOperation): Result<boolean, string> {
    switch (operation.kind) {
      case "rename":
        return this.rename(operation.target, operation.title)
      case "deprecate":
        return this.deprecate(operation.target)
      case "replace":
        return this.replace(operation.target, operation.replacement)
      case "split":
        return this.split(operation.target, operation.parts)
      case "merge":
        return this.merge(operation.targets, operation.result)
    }
  }

  private rename(uid: string, title: string): Result<boolean, string> {
    const [document, documentError] = this.documentFor(uid)
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, `unknown element '${uid}'`]

    const [fields, fieldError] = this.fieldsFor(uid)
    if (fieldError !== null) return [null, fieldError]
    if (fields === null) return [null, `unknown element '${uid}'`]
    if (fields.STATUS === "Deprecated") return [null, `'${uid}' is deprecated`]
    if (title.trim() === "") return [null, "rename requires a title"]

    document.setField(uid, "TITLE", title.trim())
    if (fields.STATUS === "Approved") document.setField(uid, "STATUS", "Proposed")
    this.recordChange(uid, "modified", fields)

    return [true, null]
  }

  private deprecate(uid: string): Result<boolean, string> {
    const [document, documentError] = this.documentFor(uid)
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, `unknown element '${uid}'`]

    const [fields, fieldError] = this.fieldsFor(uid)
    if (fieldError !== null) return [null, fieldError]
    if (fields === null) return [null, `unknown element '${uid}'`]

    document.setField(uid, "STATUS", "Deprecated")
    this.recordChange(uid, "deprecated", fields)

    return [true, null]
  }

  private replace(target: string, replacement: ProposalRecordFields): Result<boolean, string> {
    const [fields, fieldError] = this.fieldsFor(target)
    if (fieldError !== null) return [null, fieldError]
    if (fields === null) return [null, `unknown element '${target}'`]

    const [nextFields, nextError] = this.newFields(replacement, [target])
    if (nextError !== null) return [null, nextError]
    if (nextFields === null) return [null, "replacement fields failed"]

    const [added, addError] = this.append(target, nextFields)
    if (addError !== null) return [null, addError]
    if (!added) return [null, "replacement was not added"]

    const [document] = this.documentFor(target)
    if (document !== null) document.setField(target, "STATUS", "Deprecated")
    this.recordChange(target, "deprecated", fields)
    this.recordAdded(nextFields.UID)

    return [true, null]
  }

  private split(target: string, parts: ProposalRecordFields[]): Result<boolean, string> {
    const [fields, fieldError] = this.fieldsFor(target)
    if (fieldError !== null) return [null, fieldError]
    if (fields === null) return [null, `unknown element '${target}'`]
    if (parts.length === 0) return [null, "split requires at least one part"]

    for (const part of parts) {
      const [nextFields, nextError] = this.newFields(part, [target])
      if (nextError !== null) return [null, nextError]
      if (nextFields === null) return [null, "split part failed"]

      const [added, addError] = this.append(target, nextFields)
      if (addError !== null) return [null, addError]
      if (!added) return [null, "split part was not added"]
      this.recordAdded(nextFields.UID)
    }

    const [document] = this.documentFor(target)
    if (document !== null) document.setField(target, "STATUS", "Deprecated")
    this.recordChange(target, "deprecated", fields)

    return [true, null]
  }

  private merge(targets: string[], result: ProposalRecordFields): Result<boolean, string> {
    if (targets.length < 2 || new Set(targets).size !== targets.length) {
      return [null, "merge requires at least two unique targets"]
    }

    const previous = new Map<string, Record<string, string>>()
    for (const target of targets) {
      const [fields, fieldError] = this.fieldsFor(target)
      if (fieldError !== null) return [null, fieldError]
      if (fields === null) return [null, `unknown element '${target}'`]
      previous.set(target, fields)
    }

    const [nextFields, nextError] = this.newFields(result, targets)
    if (nextError !== null) return [null, nextError]
    if (nextFields === null) return [null, "merge result fields failed"]

    const [added, addError] = this.append(targets[0] ?? "", nextFields)
    if (addError !== null) return [null, addError]
    if (!added) return [null, "merge result was not added"]

    for (const target of targets) {
      const [document] = this.documentFor(target)
      if (document !== null) document.setField(target, "STATUS", "Deprecated")
      this.recordChange(target, "deprecated", previous.get(target))
    }
    this.recordAdded(nextFields.UID)

    return [true, null]
  }

  private append(target: string, fields: ProposalRecordFields): Result<boolean, string> {
    const [document, documentError] = this.documentFor(target)
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, `unknown element '${target}'`]

    const uid = (fields.UID ?? "").trim()
    if (this.pathsByUid.has(uid)) return [null, `duplicate element ID '${uid}'`]

    const [appendedUid, appendError] = document.appendRecord(fields)
    if (appendError !== null) return [null, appendError]
    if (appendedUid === null) return [null, "new record failed"]

    this.pathsByUid.set(appendedUid, this.pathsByUid.get(target) ?? "")

    return [true, null]
  }

  private newFields(
    fields: ProposalRecordFields,
    replaces: string[],
  ): Result<ProposalRecordFields, string> {
    const uid = (fields.UID ?? "").trim()
    if (uid === "") return [null, "new record requires UID"]

    const status = (fields.STATUS ?? "Proposed").trim()
    if (status !== "Draft" && status !== "Proposed") {
      return [null, `new record '${uid}' must be Draft or Proposed`]
    }

    const links = [...this.splitList(fields.REPLACES ?? ""), ...replaces]
    const uniqueLinks = [...new Set(links)]

    return [
      {
        ...fields,
        UID: uid,
        STATUS: status,
        REPLACES: uniqueLinks.join(" "),
      },
      null,
    ]
  }

  private recordAdded(uid: string): void {
    const [fields] = this.fieldsFor(uid)
    this.changes.set(uid, {
      id: uid,
      kind: this.kindFor(uid),
      action: "added",
      title: fields?.TITLE ?? uid,
      status: fields?.STATUS,
    })
  }

  private recordChange(
    uid: string,
    action: ChangeAction,
    previous: Record<string, string> | undefined,
  ): void {
    const [fields] = this.fieldsFor(uid)
    const existing = this.changes.get(uid)
    if (existing !== undefined) {
      this.changes.set(uid, {
        ...existing,
        action,
        title: fields?.TITLE ?? existing.title,
        status: fields?.STATUS,
      })

      return
    }

    this.changes.set(uid, {
      id: uid,
      kind: this.kindFor(uid),
      action,
      title: fields?.TITLE ?? uid,
      previous_title: previous?.TITLE,
      previous_status: previous?.STATUS,
      status: fields?.STATUS,
    })
  }

  private documentFor(uid: string): Result<SdocDocument, string> {
    const path = this.pathsByUid.get(uid)
    if (path === undefined) return [null, `unknown element '${uid}'`]
    if (!path.endsWith(".sdoc")) {
      return [null, `element '${uid}' is not in an editable .sdoc file`]
    }

    const document = this.documents.get(path)
    if (document === undefined) return [null, `cannot load document for '${uid}'`]

    return [document, null]
  }

  private fieldsFor(uid: string): Result<Record<string, string>, string> {
    const [document, documentError] = this.documentFor(uid)
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, `unknown element '${uid}'`]

    const fields = document.fields(uid)
    if (fields === null) return [null, `unknown element '${uid}'`]

    return [fields, null]
  }

  private hashesFor(ids: string[]): Record<string, string | null> {
    const hashes: Record<string, string | null> = {}
    for (const id of ids) hashes[id] = this.hashFor(id)

    return hashes
  }

  private hashFor(uid: string): string | null {
    const [document] = this.documentFor(uid)
    const block = document?.block(uid) ?? null
    return block === null ? null : this.hashBlock(block)
  }

  private hashBlock(block: SdocBlock): string {
    return elementContentHash(block)
  }

  private idsFor(operation: ProposalOperation): string[] {
    switch (operation.kind) {
      case "rename":
      case "deprecate":
        return [operation.target]
      case "replace":
        return [operation.target, operation.replacement.UID ?? ""]
      case "split":
        return [operation.target, ...operation.parts.map((part) => part.UID ?? "")]
      case "merge":
        return [...operation.targets, operation.result.UID ?? ""]
    }
  }

  private targetsFor(operation: ProposalOperation): string[] {
    return operation.kind === "merge" ? operation.targets : [operation.target]
  }

  private kindFor(uid: string): string {
    const prefix = uid.split("-")[0] ?? ""
    return KIND_BY_PREFIX[prefix] ?? prefix.toLowerCase()
  }

  private splitList(value: string): string[] {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  private async saveDocuments(): Promise<Result<boolean, string>> {
    for (const document of this.documents.values()) {
      if (!document.changed()) continue
      const [, saveError] = await document.save()
      if (saveError !== null) return [null, saveError]
    }

    return [true, null]
  }
}
