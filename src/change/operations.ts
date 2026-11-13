import { elementContentHash } from "../approval/hash"
import { collectC4Files } from "../core/c4"
import { loadRequirementSources } from "../core/requirements"
import { attemptAsync, type Result, ok, fail } from "../core/result"
import type { SdocBlock } from "../core/types"
import { elementId } from "../discovery/ids"
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

const ADDABLE_RECORD_KINDS = new Set(["requirement", "acceptance_criterion"])

const PREFIX_BY_KIND: Record<string, string> = {
  requirement: "REQ",
  acceptance_criterion: "AC",
  component: "CMP",
  system: "SYS",
  data_store: "DAT",
  external: "EXT",
  actor: "ACTOR",
  capability: "CAP",
  verification_objective: "VOBJ",
  verification_case: "VER",
  formal_property: "PROP",
  contract: "CON",
  evidence: "EVD",
  unknown: "UNK",
  waiver: "WVR",
  decision: "DEC",
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
  private readonly allocatedIds = new Set<string>()
  private architecture: ArchitectureEditor | null = null
  private contracts: ContractEditor | null = null
  private decisions: SdocDocument | null = null

  constructor(
    private readonly target: string,
    private readonly now: () => Date = () => new Date(),
    private readonly author: string = "proposal",
  ) {}

  async apply(operations: ProposalOperation[]): Promise<Result<OperationApplication, string>> {
    const [loaded, loadError] = await this.loadDocuments()
    if (loadError !== null) return fail(loadError)
    if (!loaded) return fail("requirement documents failed to load")

    const logs: ProposalOperationLog[] = []
    for (const operation of operations) {
      const [log, operationError] = await this.applyOperation(operation)
      if (operationError !== null) return fail(operationError)
      if (log === null) return fail("operation produced no log")
      logs.push(log)
    }

    const [saved, saveError] = await this.saveFiles()
    if (saveError !== null) return fail(saveError)
    if (!saved) return fail("documents failed to save")

    return ok({
      logs,
      changes: [...this.changes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    })
  }

  private async loadDocuments(): Promise<Result<boolean, string>> {
    const sources = await loadRequirementSources(this.target)
    const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
    if (sourceErrors.length > 0) {
      return fail(sourceErrors.map((item) => item.message).join("\n"))
    }

    for (const file of sources.files) {
      const [document, documentError] = await SdocDocument.load(file)
      if (documentError !== null) return fail(documentError)
      if (document === null) return fail(`cannot load ${file}`)
      this.documents.set(file, document)
    }

    for (const block of sources.blocks) {
      const uid = block.fields.UID
      if (uid === undefined || uid === "") continue
      if (this.pathsByUid.has(uid)) return fail(`duplicate element ID '${uid}'`)
      this.pathsByUid.set(uid, block.file)
    }

    return ok(true)
  }

  private async prepare(operation: ProposalOperation): Promise<Result<boolean, string>> {
    switch (operation.kind) {
      case "extract":
        return this.ensureArchitecture(true)
      case "move":
        return this.ensureArchitecture(false)
      case "change-contract":
        return this.ensureContracts()
      case "record-decision":
      case "record-open-question":
        return this.ensureDecisions()
      default:
        return ok(true)
    }
  }

  private async ensureDecisions(): Promise<Result<boolean, string>> {
    if (this.decisions !== null) return ok(true)

    const path = join(this.target, "spec", "requirements", "decisions.sdoc")
    const existing = this.documents.get(path)
    if (existing !== undefined) {
      this.decisions = existing
      return ok(true)
    }

    const [exists, existsError] = await attemptAsync(() => Bun.file(path).exists())
    if (existsError !== null) return fail(`cannot read ${path}: ${existsError}`)

    const [document, documentError] = exists
      ? await SdocDocument.load(path)
      : ([SdocDocument.empty(path), null] as const)
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`cannot load ${path}`)

    this.decisions = document
    this.documents.set(path, document)
    return ok(true)
  }

  private async ensureArchitecture(required: boolean): Promise<Result<boolean, string>> {
    if (this.architecture !== null) return ok(true)

    const files = await collectC4Files(join(this.target, "spec", "architecture"))
    if (files.length === 0) {
      return required
        ? [null, "no LikeC4 architecture sources found under spec/architecture"]
        : [true, null]
    }

    const [architecture, architectureError] = await ArchitectureEditor.load(this.target)
    if (architectureError !== null) return fail(architectureError)
    if (architecture === null) return fail("architecture editor failed to load")
    this.architecture = architecture

    return ok(true)
  }

  private async ensureContracts(): Promise<Result<boolean, string>> {
    if (this.contracts !== null) return ok(true)

    const files = await collectContractFiles(join(this.target, "spec", "contracts"))
    if (files.length === 0) {
      return fail("no contract sidecars found under spec/contracts")
    }

    const [contracts, contractError] = await ContractEditor.load(this.target)
    if (contractError !== null) return fail(contractError)
    if (contracts === null) return fail("contract editor failed to load")
    this.contracts = contracts

    return ok(true)
  }

  private async applyOperation(
    operation: ProposalOperation,
  ): Promise<Result<ProposalOperationLog, string>> {
    const [prepared, prepareError] = await this.prepare(operation)
    if (prepareError !== null) return fail(prepareError)
    if (!prepared) return fail("operation sources failed to load")

    const [normalized, normalizeError] = this.normalize(operation)
    if (normalizeError !== null) return fail(normalizeError)
    if (normalized === null) return fail("operation normalization failed")

    const targets = this.targetsFor(normalized)
    const ids = this.idsFor(normalized)
    const beforeHashes = this.hashesFor(ids)
    const [applied, applyError] = this.applyOne(normalized)
    if (applyError !== null) return fail(applyError)
    if (!applied) return fail("operation did not apply")

    return ok({
      kind: normalized.kind,
      at: this.now().toISOString(),
      targets,
      before_hashes: beforeHashes,
      after_hashes: this.hashesFor(ids),
    })
  }

  private normalize(operation: ProposalOperation): Result<ProposalOperation, string> {
    switch (operation.kind) {
      case "replace": {
        const [replacement, error] = this.withUid(
          operation.replacement,
          this.prefixFor(operation.target),
          "replacement",
        )
        if (error !== null) return fail(error)
        if (replacement === null) return fail("replacement fields failed")

        return ok({ ...operation, replacement })
      }
      case "split": {
        const prefix = this.prefixFor(operation.target)
        const parts: ProposalRecordFields[] = []
        for (const part of operation.parts) {
          const [next, error] = this.withUid(part, prefix, "part")
          if (error !== null) return fail(error)
          if (next === null) return fail("split part fields failed")
          parts.push(next)
        }

        return ok({ ...operation, parts })
      }
      case "merge": {
        const prefix = this.prefixFor(operation.targets[0] ?? "")
        const [result, error] = this.withUid(operation.result, prefix, "result")
        if (error !== null) return fail(error)
        if (result === null) return fail("merge result fields failed")

        return ok({ ...operation, result })
      }
      case "extract": {
        const [component, error] = this.withComponentUid(operation.component)
        if (error !== null) return fail(error)
        if (component === null) return fail("component fields failed")

        return ok({ ...operation, component })
      }
      case "add-record": {
        const prefix = PREFIX_BY_KIND[operation.recordKind]
        if (prefix === undefined || !ADDABLE_RECORD_KINDS.has(operation.recordKind)) {
          return fail(`add-record kind '${operation.recordKind}' is not supported`)
        }
        const [record, error] = this.withUid(operation.record, prefix, "record")
        if (error !== null) return fail(error)
        if (record === null) return fail("record fields failed")

        return ok({ ...operation, record })
      }
      default:
        return ok(operation)
    }
  }

  private withUid(
    fields: ProposalRecordFields,
    prefix: string,
    label: string,
  ): Result<ProposalRecordFields, string> {
    const uid = (fields.UID ?? "").trim()
    if (uid !== "") return ok({ ...fields, UID: uid })

    const title = (fields.TITLE ?? "").trim()
    if (title === "") return fail(`${label} requires a title when no ID is supplied`)

    return ok({ ...fields, UID: this.allocate(prefix, title) })
  }

  private withComponentUid(
    component: ProposalComponentFields,
  ): Result<ProposalComponentFields, string> {
    const uid = (component.UID ?? "").trim()
    if (uid !== "") return ok({ ...component, UID: uid })

    const title = (component.TITLE ?? "").trim()
    if (title === "") return fail("component requires a title when no ID is supplied")

    const kind = (component.KIND ?? "").toLowerCase()
    const prefix = PREFIX_BY_KIND[kind] ?? "CMP"

    return ok({ ...component, UID: this.allocate(prefix, title) })
  }

  private allocate(prefix: string, title: string): string {
    const base = elementId(prefix, title)
    let candidate = base
    let suffix = 2

    while (
      this.pathsByUid.has(candidate) ||
      this.allocatedIds.has(candidate) ||
      this.hasAnyElement(candidate)
    ) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }

    this.allocatedIds.add(candidate)
    return candidate
  }

  private prefixFor(uid: string): string {
    const prefix = uid.split("-")[0] ?? ""

    return prefix === "" ? "REQ" : prefix
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
      case "record-decision":
        return this.recordDecision(operation)
      case "record-open-question":
        return this.recordOpenQuestion(operation)
      case "add-record":
        return this.addRecord(operation)
    }
  }

  private rename(uid: string, title: string): Result<boolean, string> {
    const [document, documentError] = this.documentFor(uid)
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`unknown element '${uid}'`)

    const [fields, fieldError] = this.fieldsFor(uid)
    if (fieldError !== null) return fail(fieldError)
    if (fields === null) return fail(`unknown element '${uid}'`)
    if (fields.STATUS === "Deprecated") return fail(`'${uid}' is deprecated`)
    if (title.trim() === "") return fail("rename requires a title")

    document.setField(uid, "TITLE", title.trim())
    if (fields.STATUS === "Approved") document.setField(uid, "STATUS", "Proposed")
    this.recordChange(uid, "modified", fields)

    return ok(true)
  }

  private deprecate(uid: string): Result<boolean, string> {
    const [document, documentError] = this.documentFor(uid)
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`unknown element '${uid}'`)

    const [fields, fieldError] = this.fieldsFor(uid)
    if (fieldError !== null) return fail(fieldError)
    if (fields === null) return fail(`unknown element '${uid}'`)

    document.setField(uid, "STATUS", "Deprecated")
    this.recordChange(uid, "deprecated", fields)

    return ok(true)
  }

  private replace(target: string, replacement: ProposalRecordFields): Result<boolean, string> {
    const [fields, fieldError] = this.fieldsFor(target)
    if (fieldError !== null) return fail(fieldError)
    if (fields === null) return fail(`unknown element '${target}'`)

    const [nextFields, nextError] = this.newFields(replacement, [target])
    if (nextError !== null) return fail(nextError)
    if (nextFields === null) return fail("replacement fields failed")

    const [added, addError] = this.append(target, nextFields)
    if (addError !== null) return fail(addError)
    if (!added) return fail("replacement was not added")

    const [document] = this.documentFor(target)
    if (document !== null) document.setField(target, "STATUS", "Deprecated")
    this.recordChange(target, "deprecated", fields)
    this.recordAdded(nextFields.UID)

    return ok(true)
  }

  private split(target: string, parts: ProposalRecordFields[]): Result<boolean, string> {
    const [fields, fieldError] = this.fieldsFor(target)
    if (fieldError !== null) return fail(fieldError)
    if (fields === null) return fail(`unknown element '${target}'`)
    if (parts.length === 0) return fail("split requires at least one part")

    for (const part of parts) {
      const [nextFields, nextError] = this.newFields(part, [target])
      if (nextError !== null) return fail(nextError)
      if (nextFields === null) return fail("split part failed")

      const [added, addError] = this.append(target, nextFields)
      if (addError !== null) return fail(addError)
      if (!added) return fail("split part was not added")
      this.recordAdded(nextFields.UID)
    }

    const [document] = this.documentFor(target)
    if (document !== null) document.setField(target, "STATUS", "Deprecated")
    this.recordChange(target, "deprecated", fields)

    return ok(true)
  }

  private merge(targets: string[], result: ProposalRecordFields): Result<boolean, string> {
    if (targets.length < 2 || new Set(targets).size !== targets.length) {
      return fail("merge requires at least two unique targets")
    }

    const previous = new Map<string, Record<string, string>>()
    for (const target of targets) {
      const [fields, fieldError] = this.fieldsFor(target)
      if (fieldError !== null) return fail(fieldError)
      if (fields === null) return fail(`unknown element '${target}'`)
      previous.set(target, fields)
    }

    const [nextFields, nextError] = this.newFields(result, targets)
    if (nextError !== null) return fail(nextError)
    if (nextFields === null) return fail("merge result fields failed")

    const [added, addError] = this.append(targets[0] ?? "", nextFields)
    if (addError !== null) return fail(addError)
    if (!added) return fail("merge result was not added")

    for (const target of targets) {
      const [document] = this.documentFor(target)
      if (document !== null) document.setField(target, "STATUS", "Deprecated")
      this.recordChange(target, "deprecated", previous.get(target))
    }
    this.recordAdded(nextFields.UID)

    return ok(true)
  }

  private extract(
    target: string,
    component: ProposalComponentFields,
    parent: string | undefined,
    from: string | undefined,
  ): Result<boolean, string> {
    if (!target.startsWith("REQ-")) {
      return fail("extract target must be a requirement")
    }
    const fields = this.sdocFields(target)
    if (fields === null) return fail(`unknown element '${target}'`)
    if (this.hasAnyElement(component.UID)) {
      return fail(`element '${component.UID}' already exists`)
    }

    const architecture = this.architecture
    if (architecture === null) {
      return fail("no LikeC4 architecture sources found under spec/architecture")
    }

    const current = this.splitList(fields.COMPONENT ?? "")
    const source = this.sourceValue(current, from, target)
    if (source.error !== null) return fail(source.error)
    if (from !== undefined && !current.includes(from)) {
      return fail(`'${target}' does not reference component '${from}'`)
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
    if (addError !== null) return fail(addError)
    if (alias === null) return fail("component was not added")

    const next = current.filter((item) => item !== source.value)
    next.push(component.UID)
    const [document, documentError] = this.documentFor(target)
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`unknown element '${target}'`)
    document.setField(target, "COMPONENT", next.join(" "))
    if (fields.STATUS === "Approved") document.setField(target, "STATUS", "Proposed")

    this.recordChange(target, "modified", fields)
    this.recordAdded(component.UID, component.TITLE, kind)

    return ok(true)
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

    return fail(`unknown element '${target}'`)
  }

  private moveSdocField(
    target: string,
    to: string,
    field: ProposalMoveField,
    from: string | undefined,
  ): Result<boolean, string> {
    const fields = this.sdocFields(target)
    if (fields === null) return fail(`unknown element '${target}'`)

    if (field === "COMPONENT") {
      if (!to.startsWith("CMP-")) return fail("component destination must start with CMP-")
      if (this.architecture === null || !this.architecture.hasElement(to)) {
        return fail(`unknown architecture element '${to}'`)
      }
    }
    if (field === "CAPABILITY" && !to.startsWith("CAP-")) {
      return fail("capability destination must start with CAP-")
    }

    const current = this.splitList(fields[field] ?? "")
    if (current.length === 0) return fail(`'${target}' has no ${field} link to move`)
    const source = this.sourceValue(current, from, target)
    if (source.error !== null) return fail(source.error)
    if (from !== undefined && !current.includes(from)) {
      return fail(`'${target}' does not reference '${from}' in ${field}`)
    }

    const next = current.filter((item) => item !== source.value)
    next.push(to)
    const [document, documentError] = this.documentFor(target)
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`unknown element '${target}'`)
    document.setField(target, field, next.join(" "))
    if (fields.STATUS === "Approved") document.setField(target, "STATUS", "Proposed")
    this.recordChange(target, "modified", fields)

    return ok(true)
  }

  private moveArchitectureElement(target: string, to: string): Result<boolean, string> {
    const architecture = this.architecture
    if (architecture === null) return fail("architecture editor unavailable")
    const previousTitle = architecture.titleFor(target) ?? target
    const [moved, moveError] = architecture.moveContainment(target, to)
    if (moveError !== null) return fail(moveError)
    if (!moved) return fail("component was not moved")
    this.recordExternal(target, "component", "modified", previousTitle)

    return ok(true)
  }

  private recordDecision(
    operation: Extract<ProposalOperation, { kind: "record-decision" }>,
  ): Result<boolean, string> {
    const uid = this.recordUid(operation)
    if (this.hasAnyElement(uid)) return fail(`record '${uid}' already exists`)
    if (operation.target !== undefined && !this.hasAnyElement(operation.target)) {
      return fail(`unknown element '${operation.target}'`)
    }

    const owner = this.humanName(operation.owner)
    const [added, addError] = this.appendDecision({
      UID: uid,
      TITLE: operation.title,
      STATUS: "Proposed",
      STATEMENT: operation.statement,
      ...(operation.target === undefined ? {} : { DECIDES: operation.target }),
      PROVENANCE: `human:${owner}`,
      OWNER: owner,
    })
    if (addError !== null) return fail(addError)
    if (!added) return fail("decision was not recorded")
    this.recordAdded(uid)

    return ok(true)
  }

  private recordOpenQuestion(
    operation: Extract<ProposalOperation, { kind: "record-open-question" }>,
  ): Result<boolean, string> {
    const uid = this.recordUid(operation)
    if (this.hasAnyElement(uid)) return fail(`record '${uid}' already exists`)
    if (operation.target !== undefined && !this.hasAnyElement(operation.target)) {
      return fail(`unknown element '${operation.target}'`)
    }

    const owner = this.humanName(operation.owner)
    const [added, addError] = this.appendDecision({
      UID: uid,
      TITLE: operation.question,
      STATUS: "Draft",
      STATEMENT: operation.question,
      ...(operation.target === undefined ? {} : { QUESTIONS: operation.target }),
      PROVENANCE: `human:${owner}`,
      OWNER: owner,
    })
    if (addError !== null) return fail(addError)
    if (!added) return fail("open question was not recorded")
    this.recordAdded(uid)

    return ok(true)
  }

  private addRecord(
    operation: Extract<ProposalOperation, { kind: "add-record" }>,
  ): Result<boolean, string> {
    const [document, documentError] = this.requirementsDocument()
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail("no requirements document is available")

    if (operation.acceptanceOf !== undefined && operation.recordKind !== "acceptance_criterion") {
      return fail("only an acceptance criterion can link to a requirement")
    }

    const uid = (operation.record.UID ?? "").trim()
    if (uid === "") return fail("new record requires UID")
    if (this.hasAnyElement(uid)) return fail(`element '${uid}' already exists`)
    const title = (operation.record.TITLE ?? "").trim()
    if (title === "") return fail("new record requires a title")
    const status = (operation.record.STATUS ?? "Draft").trim()
    if (status !== "Draft" && status !== "Proposed") {
      return fail(`new record '${uid}' must be Draft or Proposed`)
    }

    const [appendedUid, appendError] = document.appendRecord({
      ...operation.record,
      UID: uid,
      TITLE: title,
      STATUS: status,
    })
    if (appendError !== null) return fail(appendError)
    if (appendedUid === null) return fail("new record was not added")

    this.pathsByUid.set(appendedUid, document.sourcePath())
    this.recordAdded(appendedUid)

    if (operation.acceptanceOf !== undefined) {
      const [linked, linkError] = this.linkAcceptance(operation.acceptanceOf, appendedUid)
      if (linkError !== null) return fail(linkError)
      if (!linked) return fail("acceptance criterion was not linked")
    }

    return ok(true)
  }

  private linkAcceptance(requirement: string, acceptance: string): Result<boolean, string> {
    const fields = this.sdocFields(requirement)
    if (fields === null) return fail(`unknown element '${requirement}'`)
    if (!requirement.startsWith("REQ-")) {
      return fail(`acceptance links require a requirement, not '${requirement}'`)
    }

    const [document, documentError] = this.documentFor(requirement)
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`unknown element '${requirement}'`)

    const current = this.splitList(fields.ACCEPTANCE ?? "")
    const next = current.includes(acceptance) ? current : [...current, acceptance]
    document.setField(requirement, "ACCEPTANCE", next.join(" "))
    if (fields.STATUS === "Approved") document.setField(requirement, "STATUS", "Proposed")
    this.recordChange(requirement, "modified", fields)

    return ok(true)
  }

  private requirementsDocument(): Result<SdocDocument, string> {
    const preferred = join(this.target, "spec", "requirements", "core.sdoc")
    const document = this.documents.get(preferred)
    if (document !== undefined) return ok(document)

    const path = [...this.documents.keys()].sort()[0]
    if (path === undefined) {
      return fail("no requirements document is available")
    }
    const fallback = this.documents.get(path)
    if (fallback === undefined) return fail("requirements document failed to load")

    return ok(fallback)
  }

  private humanName(value: string | undefined): string {
    const name = (value ?? this.author).replace(/\s+/g, " ").trim()

    return name === "" ? "proposal" : name
  }

  private appendDecision(fields: ProposalRecordFields): Result<boolean, string> {
    const document = this.decisions
    if (document === null) return fail("decision document is not available")

    const uid = (fields.UID ?? "").trim()
    if (this.hasAnyElement(uid)) return fail(`duplicate element ID '${uid}'`)

    const [appendedUid, appendError] = document.appendRecord(fields)
    if (appendError !== null) return fail(appendError)
    if (appendedUid === null) return fail("decision record failed")

    this.pathsByUid.set(appendedUid, document.sourcePath())
    return ok(true)
  }

  private recordUid(operation: ProposalOperation): string {
    if (operation.kind !== "record-decision" && operation.kind !== "record-open-question") {
      return ""
    }

    const prefix = operation.kind === "record-decision" ? "DEC" : "UNK"
    const source = operation.kind === "record-decision" ? operation.title : operation.question
    const slug = source
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "")

    return `${prefix}-${slug === "" ? "RECORD" : slug}`
  }

  private changeContract(target: string, fields: ProposalContractFields): Result<boolean, string> {
    const contracts = this.contracts
    if (contracts === null) return fail("no contract sidecars found under spec/contracts")
    const [patched, patchError] = contracts.patch(target, fields)
    if (patchError !== null) return fail(patchError)
    if (!patched) return fail("contract was not changed")
    this.recordExternal(target, "contract", "modified", contracts.titleFor(target) ?? target)

    return ok(true)
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
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`unknown element '${target}'`)

    const uid = (fields.UID ?? "").trim()
    if (this.hasAnyElement(uid)) return fail(`duplicate element ID '${uid}'`)

    const [appendedUid, appendError] = document.appendRecord(fields)
    if (appendError !== null) return fail(appendError)
    if (appendedUid === null) return fail("new record failed")

    this.pathsByUid.set(appendedUid, this.pathsByUid.get(target) ?? "")

    return ok(true)
  }

  private newFields(
    fields: ProposalRecordFields,
    replaces: string[],
  ): Result<ProposalRecordFields, string> {
    const uid = (fields.UID ?? "").trim()
    if (uid === "") return fail("new record requires UID")

    const status = (fields.STATUS ?? "Proposed").trim()
    if (status !== "Draft" && status !== "Proposed") {
      return fail(`new record '${uid}' must be Draft or Proposed`)
    }

    const links = [...this.splitList(fields.REPLACES ?? ""), ...replaces]
    const uniqueLinks = [...new Set(links)]

    return ok({
      ...fields,
      UID: uid,
      STATUS: status,
      REPLACES: uniqueLinks.join(" "),
    })
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
    if (path === undefined) return fail(`unknown element '${uid}'`)
    if (!path.endsWith(".sdoc")) {
      return fail(`element '${uid}' is not in an editable .sdoc file`)
    }

    const document = this.documents.get(path)
    if (document === undefined) return fail(`cannot load document for '${uid}'`)

    return ok(document)
  }

  private fieldsFor(uid: string): Result<Record<string, string>, string> {
    const [document, documentError] = this.documentFor(uid)
    if (documentError !== null) return fail(documentError)
    if (document === null) return fail(`unknown element '${uid}'`)

    const fields = document.fields(uid)
    if (fields === null) return fail(`unknown element '${uid}'`)

    return ok(fields)
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
      case "record-decision":
      case "record-open-question":
        return this.uniqueIds([
          ...(operation.target === undefined ? [] : [operation.target]),
          this.recordUid(operation),
        ])
      case "add-record":
        return this.uniqueIds([
          operation.record.UID ?? "",
          ...(operation.acceptanceOf === undefined ? [] : [operation.acceptanceOf]),
        ])
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
      case "record-decision":
      case "record-open-question":
        return this.uniqueIds([
          ...(operation.target === undefined ? [] : [operation.target]),
          this.recordUid(operation),
        ])
      case "add-record":
        return this.uniqueIds([
          operation.record.UID ?? "",
          ...(operation.acceptanceOf === undefined ? [] : [operation.acceptanceOf]),
        ])
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
        return fail(`cannot write ${path}: ${writeError}`)
      }
      written.push({ path, original: file.original })
    }

    return ok(true)
  }
}

export { WorkspaceOperationApplier as SdocOperationApplier }
