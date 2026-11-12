import type { DisplayEntry } from "../../../../model"
import type { OperationForm } from "../../../forms/operation-form"

export function MoveOperationFields({
  form,
  entries,
  update,
}: {
  form: OperationForm
  entries: DisplayEntry[]
  update(patch: Partial<OperationForm>): void
}) {
  const destinations = entries.filter((entry) => entry.ref !== form.target)

  return (
    <>
      <label>
        Move under
        <select
          value={form.destination}
          onChange={(event) => update({ destination: event.target.value })}
        >
          {destinations.map((entry) => (
            <option key={entry.ref} value={entry.ref}>
              {entry.label} ({entry.kindLabel})
            </option>
          ))}
        </select>
      </label>
      <label>
        Link type
        <select
          value={form.moveField}
          onChange={(event) =>
            update({ moveField: event.target.value as OperationForm["moveField"] })
          }
        >
          <option value="">Automatic by item type</option>
          <option value="COMPONENT">Requirement component link</option>
          <option value="CAPABILITY">Requirement capability link</option>
        </select>
      </label>
    </>
  )
}
