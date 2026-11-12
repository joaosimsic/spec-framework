import type { DisplayEntry } from "../../../../model"
import type { DraftForm } from "../../../forms/draft-builder"

const LINKS = [
  ["component", "Component", ["component", "system"]],
  ["capability", "Capability", ["capability"]],
  ["formal", "Formal property", ["formal_property"]],
  ["contract", "Contract", ["contract"]],
  ["evidence", "Expected evidence", ["evidence"]],
] as const

export function DraftLinkFields({
  form,
  entries,
  update,
}: {
  form: DraftForm
  entries: DisplayEntry[]
  update(patch: Partial<DraftForm>): void
}) {
  return (
    <>
      {LINKS.map(([field, label, kinds]) => {
        const options = entries.filter((entry) =>
          (kinds as readonly string[]).includes(entry.technical.kind),
        )
        if (options.length === 0) return null

        return (
          <label key={field}>
            {label}
            <select
              value={form[field]}
              onChange={(event) => update({ [field]: event.target.value })}
            >
              <option value="">Not linked</option>
              {options.map((entry) => (
                <option key={entry.ref} value={entry.ref}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )
      })}
    </>
  )
}
