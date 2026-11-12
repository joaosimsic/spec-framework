import { useState } from "react"
import type { ProposalOperation } from "../../../../change"
import type { DisplayEntry } from "../../../../model"
import { ContractOperationFields } from "./ContractOperationFields"
import { DecisionOperationFields } from "./DecisionOperationFields"
import { MoveOperationFields } from "./MoveOperationFields"
import { RecordOperationFields } from "./RecordOperationFields"
import { buildOperation } from "../../../forms/operation-builder"
import {
  canSubmit,
  initialOperationForm,
  type OperationForm,
  type ReworkOperationKind,
} from "../../../forms/operation-form"

const KINDS: Array<{ value: ReworkOperationKind; label: string }> = [
  { value: "rename", label: "Rename" },
  { value: "deprecate", label: "Retire" },
  { value: "replace", label: "Replace" },
  { value: "split", label: "Split" },
  { value: "merge", label: "Merge" },
  { value: "extract", label: "Extract component" },
  { value: "move", label: "Move" },
  { value: "change-contract", label: "Change contract" },
  { value: "record-decision", label: "Record decision" },
  { value: "record-open-question", label: "Record open question" },
]

export function OperationComposer({
  entries,
  busy,
  onApply,
}: {
  entries: DisplayEntry[]
  busy: boolean
  onApply(operation: ProposalOperation): Promise<boolean>
}) {
  const [form, setForm] = useState<OperationForm>(() =>
    initialOperationForm(entries[0]?.ref ?? "", entries[1]?.ref ?? ""),
  )
  const [confirmed, setConfirmed] = useState(false)

  function update(patch: Partial<OperationForm>): void {
    setForm((current) => ({ ...current, ...patch }))
    if (patch.kind !== undefined) setConfirmed(false)
  }

  async function submit(): Promise<void> {
    const operation = buildOperation(form)
    if (operation === null) return

    const succeeded = await onApply(operation)
    if (!succeeded) return

    update({ title: "", statement: "", parts: "", question: "", extraTargets: [] })
    setConfirmed(false)
  }

  const optionalTarget = form.kind === "record-decision" || form.kind === "record-open-question"
  const ready = canSubmit(form) && (form.kind !== "deprecate" || confirmed)

  return (
    <section aria-labelledby="operation-heading" className="panel">
      <h2 id="operation-heading">Adjust the proposal</h2>
      <p className="meta">
        Changes are simulated on the proposal branch. Approval still happens in the CLI.
      </p>
      <div className="operation-grid">
        <label>
          Operation
          <select
            value={form.kind}
            onChange={(event) => update({ kind: event.target.value as ReworkOperationKind })}
          >
            {KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          {optionalTarget ? "Linked item" : "Item"}
          <select value={form.target} onChange={(event) => update({ target: event.target.value })}>
            {optionalTarget && <option value="">No linked item</option>}
            {entries.map((entry) => (
              <option key={entry.ref} value={entry.ref}>
                {entry.label} ({entry.kindLabel})
              </option>
            ))}
          </select>
        </label>

        {form.kind === "rename" && (
          <label>
            New name
            <input value={form.title} onChange={(event) => update({ title: event.target.value })} />
          </label>
        )}

        <OperationFields entries={entries} form={form} update={update} />

        {form.kind === "deprecate" && (
          <label className="checkbox">
            <input
              checked={confirmed}
              type="checkbox"
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I understand this retires the item.
          </label>
        )}
      </div>
      <button disabled={busy || !ready} type="button" onClick={() => void submit()}>
        Apply to proposal
      </button>
    </section>
  )
}

function OperationFields(props: {
  entries: DisplayEntry[]
  form: OperationForm
  update(patch: Partial<OperationForm>): void
}) {
  const { form } = props
  if (
    form.kind === "replace" ||
    form.kind === "split" ||
    form.kind === "merge" ||
    form.kind === "extract"
  ) {
    return <RecordOperationFields {...props} />
  }
  if (form.kind === "move") return <MoveOperationFields {...props} />
  if (form.kind === "change-contract") return <ContractOperationFields {...props} />
  if (form.kind === "record-decision" || form.kind === "record-open-question") {
    return <DecisionOperationFields {...props} />
  }
  return null
}
