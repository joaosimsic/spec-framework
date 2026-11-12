import { useState } from "react"
import type { ProposalOperation } from "../../../../change"
import type { DisplayEntry } from "../../../../model"
import {
  buildDraftOperation,
  canSubmitDraft,
  initialDraftForm,
  type DraftForm,
  type DraftMode,
} from "../../../forms/draft-builder"
import { DraftLinkFields } from "./DraftLinkFields"
import { DraftNameFields } from "./DraftNameFields"

const MODES: Array<{ value: DraftMode; label: string }> = [
  { value: "requirement", label: "Add requirement" },
  { value: "acceptance", label: "Add acceptance criterion" },
  { value: "revise", label: "Revise an item" },
  { value: "retire", label: "Retire an item" },
  { value: "decision", label: "Record decision" },
  { value: "question", label: "Record open question" },
]

export function DraftEditor({
  entries,
  busy,
  onApply,
}: {
  entries: DisplayEntry[]
  busy: boolean
  onApply(operation: ProposalOperation): Promise<boolean>
}) {
  const [form, setForm] = useState(initialDraftForm)
  const drafts = entries.filter((entry) => editableKind(entry.technical.kind))
  const requirements = entries.filter((entry) => entry.technical.kind === "requirement")

  function update(patch: Partial<DraftForm>): void {
    setForm((current) => ({ ...current, ...patch }))
  }

  async function submit(): Promise<void> {
    const operation = buildDraftOperation(form)
    if (operation === null) return

    const succeeded = await onApply(operation)
    if (!succeeded) return

    update({ title: "", statement: "", rationale: "" })
  }

  return (
    <section aria-labelledby="draft-heading" className="panel">
      <h2 id="draft-heading">Shape the draft</h2>
      <p className="meta">
        Records stay drafts. Validation and approval happen in the CLI after review.
      </p>
      <div className="operation-grid">
        <label>
          Change
          <select
            value={form.mode}
            onChange={(event) => update({ mode: event.target.value as DraftMode })}
          >
            {MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>

        {form.mode === "revise" || form.mode === "retire" ? (
          <label>
            Item
            <select
              value={form.target}
              onChange={(event) => update({ target: event.target.value })}
            >
              <option value="">Choose an item</option>
              {drafts.map((entry) => (
                <option key={entry.ref} value={entry.ref}>
                  {entry.label} ({entry.kindLabel})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {form.mode === "acceptance" && (
          <label>
            Required by
            <select
              value={form.requirement}
              onChange={(event) => update({ requirement: event.target.value })}
            >
              <option value="">No requirement</option>
              {requirements.map((entry) => (
                <option key={entry.ref} value={entry.ref}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {(form.mode === "decision" || form.mode === "question") && (
          <label>
            Linked item
            <select
              value={form.target}
              onChange={(event) => update({ target: event.target.value })}
            >
              <option value="">No linked item</option>
              {entries.map((entry) => (
                <option key={entry.ref} value={entry.ref}>
                  {entry.label} ({entry.kindLabel})
                </option>
              ))}
            </select>
          </label>
        )}

        <DraftNameFields form={form} update={update} />
        {(form.mode === "requirement" || form.mode === "acceptance") && (
          <DraftLinkFields entries={entries} form={form} update={update} />
        )}
      </div>
      <button disabled={busy || !canSubmitDraft(form)} type="button" onClick={() => void submit()}>
        Apply to draft
      </button>
    </section>
  )
}

function editableKind(kind: string): boolean {
  return kind === "requirement" || kind === "acceptance_criterion"
}
