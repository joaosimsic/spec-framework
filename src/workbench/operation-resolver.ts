import type { ProposalOperation } from "../change/types"
import type { Result } from "../core/result"
import type { DisplayFailure } from "../model"
import type { WorkbenchFailure } from "./failure"
import { WorkbenchGraphDisplay } from "./graph-display"

export class WorkbenchOperationResolver {
  constructor(private readonly display: WorkbenchGraphDisplay) {}

  resolve(operations: ProposalOperation[]): Result<ProposalOperation[], WorkbenchFailure> {
    const resolved: ProposalOperation[] = []

    for (const operation of operations) {
      const [next, error] = this.operation(operation)
      if (error !== null) return [null, error]
      if (next === null) continue
      resolved.push(next)
    }

    return [resolved, null]
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
    }
  }

  private rename(
    operation: Extract<ProposalOperation, { kind: "rename" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return [null, error]
    if (target === null) return [null, this.notFound(operation.target)]

    return [{ ...operation, target }, null]
  }

  private deprecate(
    operation: Extract<ProposalOperation, { kind: "deprecate" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return [null, error]
    if (target === null) return [null, this.notFound(operation.target)]

    return [{ ...operation, target }, null]
  }

  private replace(
    operation: Extract<ProposalOperation, { kind: "replace" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return [null, error]
    if (target === null) return [null, this.notFound(operation.target)]

    return [{ ...operation, target }, null]
  }

  private split(
    operation: Extract<ProposalOperation, { kind: "split" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return [null, error]
    if (target === null) return [null, this.notFound(operation.target)]

    return [{ ...operation, target }, null]
  }

  private merge(
    operation: Extract<ProposalOperation, { kind: "merge" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const targets: string[] = []

    for (const target of operation.targets) {
      const [resolved, error] = this.handle(target)
      if (error !== null) return [null, error]
      if (resolved === null) return [null, this.notFound(target)]
      targets.push(resolved)
    }

    return [{ ...operation, targets }, null]
  }

  private extract(
    operation: Extract<ProposalOperation, { kind: "extract" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, targetError] = this.handle(operation.target)
    if (targetError !== null) return [null, targetError]
    if (target === null) return [null, this.notFound(operation.target)]

    const [parent, parentError] = this.optionalHandle(operation.parent)
    if (parentError !== null) return [null, parentError]

    const [from, fromError] = this.optionalHandle(operation.from)
    if (fromError !== null) return [null, fromError]

    return [
      {
        ...operation,
        target,
        ...(parent === null ? {} : { parent }),
        ...(from === null ? {} : { from }),
      },
      null,
    ]
  }

  private move(
    operation: Extract<ProposalOperation, { kind: "move" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, targetError] = this.handle(operation.target)
    if (targetError !== null) return [null, targetError]
    if (target === null) return [null, this.notFound(operation.target)]

    const [to, toError] = this.handle(operation.to)
    if (toError !== null) return [null, toError]
    if (to === null) return [null, this.notFound(operation.to)]

    const [from, fromError] = this.optionalHandle(operation.from)
    if (fromError !== null) return [null, fromError]

    return [{ ...operation, target, to, ...(from === null ? {} : { from }) }, null]
  }

  private changeContract(
    operation: Extract<ProposalOperation, { kind: "change-contract" }>,
  ): Result<ProposalOperation, WorkbenchFailure> {
    const [target, error] = this.handle(operation.target)
    if (error !== null) return [null, error]
    if (target === null) return [null, this.notFound(operation.target)]

    return [{ ...operation, target }, null]
  }

  private optionalHandle(value: string | undefined): Result<string | null, WorkbenchFailure> {
    if (value === undefined) return [null, null]

    return this.handle(value)
  }

  private handle(value: string): Result<string | null, WorkbenchFailure> {
    const [resolved, failure] = this.display.resolveHandle(value)
    if (failure !== null) return [null, this.failure(failure)]
    if (resolved === null) return [null, null]

    return [resolved, null]
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
