import type { ProposalOperation } from "../change/types"
import { fail, ok, type Result } from "../core/result"
import type { DisplayFailure } from "../model"
import type { WorkbenchFailure } from "./failure"
import { WorkbenchGraphDisplay } from "./graph-display"

const LINK_FIELDS = ["ACCEPTANCE", "COMPONENT", "CAPABILITY", "FORMAL", "CONTRACTS", "EVIDENCE"]

export class WorkbenchOperationResolver {
  constructor(private readonly display: WorkbenchGraphDisplay) {}

  resolve(operations: ProposalOperation[]): Result<ProposalOperation[], WorkbenchFailure> {
    const resolved: ProposalOperation[] = []

    for (const operation of operations) {
      const [next, error] = this.operation(operation)
      if (error !== null) return fail(error)
      if (next === null) continue
      resolved.push(next)
    }

    return ok(resolved)
  }

  private operation(operation: ProposalOperation): Result<ProposalOperation, WorkbenchFailure> {
    switch (operation.kind) {
      case "rename":
        return this.rename(operation)
      case "deprecate":
        return this.deprecate(operation)
      case "replace":
        return this.replace(operation)
      case "split":
        return this.split(operation)
      case "merge":
        return this.merge(operation)
      case "extract":
        return this.extract(operation)
      case "move":
        return this.move(operation)
      case "change-contract":
        return this.changeContract(operation)
      case "record-decision":
        return this.recordDecision(operation)
      case "record-open-question":
        return this.recordOpenQuestion(operation)
      case "add-record":
        return this.addRecord(operation)
    }
  }

  private rename(
    operation: Extract<ProposalOperation, { kind: "rename" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return fail(error)
    if (target === null) return fail(this.notFound(operation.target))

    return ok({ ...operation, target })
  }

  private deprecate(
    operation: Extract<ProposalOperation, { kind: "deprecate" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return fail(error)
    if (target === null) return fail(this.notFound(operation.target))

    return ok({ ...operation, target })
  }

  private replace(
    operation: Extract<ProposalOperation, { kind: "replace" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return fail(error)
    if (target === null) return fail(this.notFound(operation.target))

    return ok({ ...operation, target })
  }

  private split(
    operation: Extract<ProposalOperation, { kind: "split" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return fail(error)
    if (target === null) return fail(this.notFound(operation.target))

    return ok({ ...operation, target })
  }

  private merge(
    operation: Extract<ProposalOperation, { kind: "merge" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const targets: string[] = []

    for (const target of operation.targets) {
      const [resolved, error] = this.handle(target)
      if (error !== null) return fail(error)
      if (resolved === null) return fail(this.notFound(target))
      targets.push(resolved)
    }

    return ok({ ...operation, targets })
  }

  private extract(
    operation: Extract<ProposalOperation, { kind: "extract" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, targetError] = this.handle(operation.target)
    if (targetError !== null) return fail(targetError)
    if (target === null) return fail(this.notFound(operation.target))

    const [parent, parentError] = this.optionalHandle(operation.parent)
    if (parentError !== null) return fail(parentError)

    const [from, fromError] = this.optionalHandle(operation.from)
    if (fromError !== null) return fail(fromError)

    return ok({
      ...operation,
      target,
      ...(parent === null ? {} : { parent }),
      ...(from === null ? {} : { from }),
    })
  }

  private move(
    operation: Extract<ProposalOperation, { kind: "move" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, targetError] = this.handle(operation.target)
    if (targetError !== null) return fail(targetError)
    if (target === null) return fail(this.notFound(operation.target))

    const [to, toError] = this.handle(operation.to)
    if (toError !== null) return fail(toError)
    if (to === null) return fail(this.notFound(operation.to))

    const [from, fromError] = this.optionalHandle(operation.from)
    if (fromError !== null) return fail(fromError)

    return ok({ ...operation, target, to, ...(from === null ? {} : { from }) })
  }

  private changeContract(
    operation: Extract<ProposalOperation, { kind: "change-contract" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return fail(error)
    if (target === null) return fail(this.notFound(operation.target))

    return ok({ ...operation, target })
  }

  private recordDecision(
    operation: Extract<ProposalOperation, { kind: "record-decision" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const target = this.optionalTarget(operation.target)
    if (target.error !== null) return fail(target.error)

    return ok({
      ...operation,
      ...(target.value === null ? {} : { target: target.value }),
    })
  }

  private recordOpenQuestion(
    operation: Extract<ProposalOperation, { kind: "record-open-question" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const target = this.optionalTarget(operation.target)
    if (target.error !== null) return fail(target.error)

    return ok({
      ...operation,
      ...(target.value === null ? {} : { target: target.value }),
    })
  }

  private addRecord(
    operation: Extract<ProposalOperation, { kind: "add-record" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [record, recordError] = this.recordFields(operation.record)
    if (recordError !== null) return fail(recordError)
    if (record === null) return fail(this.notFound(operation.record.TITLE ?? "record"))

    const [acceptanceOf, acceptanceError] = this.optionalHandle(operation.acceptanceOf)
    if (acceptanceError !== null) return fail(acceptanceError)

    return ok({
      ...operation,
      record,
      ...(acceptanceOf === null ? {} : { acceptanceOf }),
    })
  }

  private recordFields(
    fields: Record<string, string>,
  ): Result<Record<string, string>, WorkbenchFailure> {
    const resolved: Record<string, string> = { ...fields }

    for (const field of LINK_FIELDS) {
      const value = resolved[field]
      if (value === undefined) continue

      const [links, linkError] = this.linkValue(value)
      if (linkError !== null) return fail(linkError)
      if (links === null) return fail(this.notFound(value))

      resolved[field] = links
    }

    return ok(resolved)
  }

  private linkValue(value: string): Result<string | null, WorkbenchFailure> {
    const handles = value.split(/[,\s]+/).filter(Boolean)
    if (handles.length === 0) return ok(null)

    const ids: string[] = []
    for (const handle of handles) {
      const [resolved, error] = this.handle(handle)
      if (error !== null) return fail(error)
      if (resolved === null) return ok(null)
      ids.push(resolved)
    }

    return ok(ids.join(" "))
  }

  private optionalTarget(value: string | undefined): {
    value: string | null
    error: WorkbenchFailure | null
  } {
    if (value === undefined) return { value: null, error: null }

    const [resolved, error] = this.handle(value)
    if (error !== null) return { value: null, error }
    if (resolved === null) return { value: null, error: this.notFound(value) }

    return { value: resolved, error: null }
  }

  private optionalHandle(value: string | undefined): Result<string | null, WorkbenchFailure> {
    if (value === undefined) return ok(null)

    return this.handle(value)
  }

  private handle(value: string): Result<string | null, WorkbenchFailure> {
    const [resolved, failure] = this.display.resolveHandle(value)
    if (failure !== null) return fail(this.failure(failure))
    if (resolved === null) return ok(null)

    return ok(resolved)
  }

  private failure(failure: DisplayFailure): WorkbenchFailure {
    const choices = failure.code === "DISPLAY-AMBIGUOUS" ? failure.choices : undefined

    return {
      code: failure.code,
      message: failure.message,
      status: failure.code === "DISPLAY-AMBIGUOUS" ? 409 : 404,
      ...(choices === undefined
        ? {}
        : { choices: choices.map((choice) => ({ label: choice.label, context: choice.context })) }),
    }
  }

  private notFound(target: string): WorkbenchFailure {
    return { code: "WORKBENCH-NOT-FOUND", message: `unknown item: ${target}`, status: 404 }
  }
}
