import { elementContentHash } from "../approval/hash"
import { collectC4Files } from "../core/c4"
import { loadRequirementSources } from "../core/requirements"
import { attemptAsync, type Result } from "../core/result"
import type { SdocBlock } from "../core/types"
import { join } from "node:path"
import { ArchitectureEditor } from "./architecture-editor"
import { collectContractFiles, ContractEditor } from "./contract-editor"
import { SdocDocument } from "./sdoc-editor"
import type {
  ChangeAction,
  ChangeEntry,
  ProposalComponentFields,
  ProposalContractFields,
  ProposalMoveField,
  ProposalOperation,
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

interface WritableFile {
  text: string
  original: string
}

export interface OperationApplication {
  logs: ProposalOperationLog[]
  changes: ChangeEntry[]
}

export class WorkspaceOperationApplier {
  private readonly documents = new Map<string, SdocDocument>()
  private readonly pathsByUid = new Map<string, string>()
  private readonly changes = new Map<string, ChangeEntry>()
  private architecture: ArchitectureEditor | null = null
  private contracts: ContractEditor | null = null

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

    const [saved, saveError] = await this.saveFiles()
    if (saveError !== null) return [null, saveError]
    if (!saved) return [null, "documents failed to save"]

    return [
      {
        logs,
        changes: [...this.changes.values()].sort((left, right) => left.id.localeCompare(right.id)),
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

  private async prepare(operation: ProposalOperation): Promise<Result<boolean, string>> {
    switch (operation.kind) {
      case "extract":
        return this.ensureArchitecture(true)
      case "move":
        return this.ensureArchitecture(false)
      case "change-contract":
        return this.ensureContracts()
      default:
        return [true, null]
    }
  }

  private async ensureArchitecture(required: boolean): Promise<Result<boolean, string>> {
    if (this.architecture !== null) return [true, null]

    const files = await collectC4Files(join(this.target, "spec", "architecture"))
    if (files.length === 0) {
      return required
        ? [null, "no LikeC4 architecture sources found under spec/architecture"]
        : [true, null]
    }

    const [architecture, architectureError] = await ArchitectureEditor.load(this.target)
    if (architectureError !== null) return [null, architectureError]
    if (architecture === null) return [null, "architecture editor failed to load"]
    this.architecture = architecture

    return [true, null]
  }

  private async ensureContracts(): Promise<Result<boolean, string>> {
    if (this.contracts !== null) return [true, null]

    const files = await collectContractFiles(join(this.target, "spec", "contracts"))
    if (files.length === 0) {
      return [null, "no contract sidecars found under spec/contracts"]
    }

    const [contracts, contractError] = await ContractEditor.load(this.target)
    if (contractError !== null) return [null, contractError]
    if (contracts === null) return [null, "contract editor failed to load"]
    this.contracts = contracts

    return [true, null]
  }

  private async applyOperation(
    operation: ProposalOperation,
  ): Promise<Result<ProposalOperationLog, string>> {
    const [prepared, prepareError] = await this.prepare(operation)
    if (prepareError !== null) return [null, prepareError]
    if (!prepared) return [null, "operation sources failed to load"]

    const targets = this.targetsFor(operation)
    const ids = this.idsFor(operation)
    const beforeHashes = this.hashesFor(ids)
    const [applied, applyError] = this.applyOne(operation)
    if (applyError !== null) return [null, applyError]
    if (!applied) return [null, "operation did not apply"]

    return [
      {
        kind: operation.kind,
        at: this.now().toISOString(),
        targets,
        before_hashes: beforeHashes,
        after_hashes: this.hashesFor(ids),
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
      case "extract":
        return this.extract(operation.target, operation.component, operation.parent, operation.from)
      case "move":
        return this.move(operation.target, operation.to, operation.field, operation.from)
      case "change-contract":
        return this.changeContract(operation.target, operation.fields)
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

  private extract(
    target: string,
    component: ProposalComponentFields,
    parent: string | undefined,
    from: string | undefined,
  ): Result<boolean, string> {
    if (!target.startsWith("REQ-")) {
      return [null, "extract target must be a requirement"]
    }
    const fields = this.sdocFields(target)
    if (fields === null) return [null, `unknown element '${target}'`]
    if (this.hasAnyElement(component.UID)) {
      return [null, `element '${component.UID}' already exists`]
    }

    const architecture = this.architecture
    if (architecture === null) {
      return [null, "no LikeC4 architecture sources found under spec/architecture"]
    }

    const current = this.splitList(fields.COMPONENT ?? "")
    const source = this.sourceValue(current, from, target)
    if (source.error !== null) return [null, source.error]
    if (from !== undefined && !current.includes(from)) {
      return [null, `'${target}' does not reference component '${from}'`]
    }

    const parentId =
      parent ??
      (source.value === undefined ? undefined : (architecture.parentId(source.value) ?? undefined))
    const kind = component.KIND ?? "component"
    const [alias, addError] = architecture.addElement(
      component.UID,
      component.TITLE,
      kind,
      parentId,
    )
    if (addError !== null) return [null, addError]
    if (alias === null) return [null, "component was not added"]

    const next = current.filter((item) => item !== source.value)
    next.push(component.UID)
    const [document, documentError] = this.documentFor(target)
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, `unknown element '${target}'`]
    document.setField(target, "COMPONENT", next.join(" "))
    if (fields.STATUS === "Approved") document.setField(target, "STATUS", "Proposed")

    this.recordChange(target, "modified", fields)
    this.recordAdded(component.UID, component.TITLE, kind)

    return [true, null]
  }

  private move(
    target: string,
    to: string,
    field: ProposalMoveField | undefined,
    from: string | undefined,
  ): Result<boolean, string> {
    if (this.pathsByUid.has(target)) {
      return this.moveSdocField(target, to, field ?? "COMPONENT", from)
    }
    if (this.architecture?.hasElement(target) === true) {
      return this.moveArchitectureElement(target, to)
    }

    return [null, `unknown element '${target}'`]
  }

  private moveSdocField(
    target: string,
    to: string,
    field: ProposalMoveField,
    from: string | undefined,
  ): Result<boolean, string> {
    const fields = this.sdocFields(target)
    if (fields === null) return [null, `unknown element '${target}'`]

    if (field === "COMPONENT") {
      if (!to.startsWith("CMP-")) return [null, "component destination must start with CMP-"]
      if (this.architecture === null || !this.architecture.hasElement(to)) {
        return [null, `unknown architecture element '${to}'`]
      }
    }
    if (field === "CAPABILITY" && !to.startsWith("CAP-")) {
      return [null, "capability destination must start with CAP-"]
    }

    const current = this.splitList(fields[field] ?? "")
    if (current.length === 0) return [null, `'${target}' has no ${field} link to move`]
    const source = this.sourceValue(current, from, target)
    if (source.error !== null) return [null, source.error]
    if (from !== undefined && !current.includes(from)) {
      return [null, `'${target}' does not reference '${from}' in ${field}`]
    }

    const next = current.filter((item) => item !== source.value)
    next.push(to)
    const [document, documentError] = this.documentFor(target)
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, `unknown element '${target}'`]
    document.setField(target, field, next.join(" "))
    if (fields.STATUS === "Approved") document.setField(target, "STATUS", "Proposed")
    this.recordChange(target, "modified", fields)

    return [true, null]
  }

  private moveArchitectureElement(target: string, to: string): Result<boolean, string> {
    const architecture = this.architecture
    if (architecture === null) return [null, "architecture editor unavailable"]
    const previousTitle = architecture.titleFor(target) ?? target
    const [moved, moveError] = architecture.moveContainment(target, to)
    if (moveError !== null) return [null, moveError]
    if (!moved) return [null, "component was not moved"]
    this.recordExternal(target, "component", "modified", previousTitle)

    return [true, null]
  }

  private changeContract(target: string, fields: ProposalContractFields): Result<boolean, string> {
    const contracts = this.contracts
    if (contracts === null) return [null, "no contract sidecars found under spec/contracts"]
    const [patched, patchError] = contracts.patch(target, fields)
    if (patchError !== null) return [null, patchError]
    if (!patched) return [null, "contract was not changed"]
    this.recordExternal(target, "contract", "modified", contracts.titleFor(target) ?? target)

    return [true, null]
  }

  private sourceValue(
    current: string[],
    from: string | undefined,
    target: string,
  ): { value: string | undefined; error: string | null } {
    if (from !== undefined) return { value: from, error: null }
    if (current.length > 1) {
      return {
        value: undefined,
        error: `'${target}' has multiple links; specify from`,
      }
    }

    return { value: current[0], error: null }
  }

  private append(target: string, fields: ProposalRecordFields): Result<boolean, string> {
    const [document, documentError] = this.documentFor(target)
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, `unknown element '${target}'`]

    const uid = (fields.UID ?? "").trim()
    if (this.hasAnyElement(uid)) return [null, `duplicate element ID '${uid}'`]

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

  private recordAdded(uid: string, title?: string, kind?: string): void {
    const fields = this.sdocFields(uid)
    this.changes.set(uid, {
      id: uid,
      kind: kind ?? this.kindFor(uid),
      action: "added",
      title: title ?? fields?.TITLE ?? uid,
      status: fields?.STATUS,
    })
  }

  private recordChange(
    uid: string,
    action: ChangeAction,
    previous: Record<string, string> | undefined,
  ): void {
    const fields = this.sdocFields(uid) ?? previous
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

  private recordExternal(
    uid: string,
    kind: string,
    action: ChangeAction,
    previousTitle: string,
  ): void {
    const title =
      this.architecture?.hasElement(uid) === true
        ? (this.architecture.titleFor(uid) ?? previousTitle)
        : (this.contracts?.titleFor(uid) ?? previousTitle)
    const existing = this.changes.get(uid)
    if (existing !== undefined) {
      this.changes.set(uid, {
        ...existing,
        action,
        title,
      })

      return
    }

    this.changes.set(uid, {
      id: uid,
      kind,
      action,
      title,
      previous_title: previousTitle,
    })
  }

  private hasAnyElement(uid: string): boolean {
    return (
      this.pathsByUid.has(uid) ||
      this.architecture?.hasElement(uid) === true ||
      this.contracts?.has(uid) === true
    )
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

  private sdocFields(uid: string): Record<string, string> | null {
    const path = this.pathsByUid.get(uid)
    if (path === undefined) return null

    return this.documents.get(path)?.fields(uid) ?? null
  }

  private hashesFor(ids: string[]): Record<string, string | null> {
    const hashes: Record<string, string | null> = {}
    for (const id of ids) hashes[id] = this.hashFor(id)

    return hashes
  }

  private hashFor(uid: string): string | null {
    const path = this.pathsByUid.get(uid)
    if (path !== undefined) {
      const block = this.documents.get(path)?.block(uid) ?? null
      return block === null ? null : this.hashBlock(block)
    }

    const architectureHash = this.architecture?.hashFor(uid) ?? null
    if (architectureHash !== null) return architectureHash

    return this.contracts?.hashFor(uid) ?? null
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
        return this.uniqueIds([operation.target, operation.replacement.UID ?? ""])
      case "split":
        return this.uniqueIds([operation.target, ...operation.parts.map((part) => part.UID ?? "")])
      case "merge":
        return this.uniqueIds([...operation.targets, operation.result.UID ?? ""])
      case "extract": {
        const fields = this.sdocFields(operation.target)
        const current = this.splitList(fields?.COMPONENT ?? "")
        const source = operation.from ?? (current.length === 1 ? current[0] : undefined)
        return this.uniqueIds([
          operation.target,
          operation.component.UID,
          ...(source === undefined ? [] : [source]),
          ...(operation.parent === undefined ? [] : [operation.parent]),
        ])
      }
      case "move": {
        const ids = [operation.target, operation.to]
        if (this.architecture?.hasElement(operation.target) === true) {
          const parent = this.architecture.parentId(operation.target)
          if (parent !== null) ids.push(parent)
        } else {
          const fields = this.sdocFields(operation.target)
          const current = this.splitList(fields?.[operation.field ?? "COMPONENT"] ?? "")
          const source = operation.from ?? (current.length === 1 ? current[0] : undefined)
          if (source !== undefined) ids.push(source)
        }
        return this.uniqueIds(ids)
      }
      case "change-contract":
        return [operation.target]
    }
  }

  private targetsFor(operation: ProposalOperation): string[] {
    switch (operation.kind) {
      case "merge":
        return operation.targets
      case "extract":
        return this.uniqueIds([operation.target, operation.component.UID])
      case "move":
        return this.uniqueIds([operation.target, operation.to])
      default:
        return [operation.target]
    }
  }

  private uniqueIds(ids: string[]): string[] {
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
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

  private async saveFiles(): Promise<Result<boolean, string>> {
    const files = new Map<string, WritableFile>()

    for (const document of this.documents.values()) {
      if (!document.changed()) continue
      files.set(document.sourcePath(), {
        text: document.text(),
        original: document.originalText(),
      })
    }
    for (const file of this.architecture?.files() ?? []) {
      if (!file.changed) continue
      files.set(file.path, { text: file.text, original: file.original })
    }
    for (const file of this.contracts?.files() ?? []) {
      if (!file.changed) continue
      files.set(file.path, { text: file.text, original: file.original })
    }

    const ordered = [...files.entries()].sort(([left], [right]) => left.localeCompare(right))
    const written: Array<{ path: string; original: string }> = []

    for (const [path, file] of ordered) {
      const [, writeError] = await attemptAsync(() => Bun.write(path, file.text))
      if (writeError !== null) {
        for (const previous of written.reverse()) {
          await Bun.write(previous.path, previous.original).catch(() => undefined)
        }
        return [null, `cannot write ${path}: ${writeError}`]
      }
      written.push({ path, original: file.original })
    }

    return [true, null]
  }
}

export { WorkspaceOperationApplier as SdocOperationApplier }
