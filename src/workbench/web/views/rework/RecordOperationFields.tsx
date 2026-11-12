import type { DisplayEntry } from "../../../../model"
import type { OperationForm } from "../../../forms/operation-form"

export function RecordOperationFields({
  form,
  entries,
  update,
}: {
  form: OperationForm
  entries: DisplayEntry[]
  update(patch: Partial<OperationForm>): void
}) {
  if (form.kind === "replace") {
    return (
      <>
        <label>
          New name
          <input value={form.title} onChange={(event) => update({ title: event.target.value })} />
        </label>
        <label>
          New statement
          <textarea
            value={form.statement}
            onChange={(event) => update({ statement: event.target.value })}
          />
        </label>
      </>
    )
  }

  if (form.kind === "split") {
    return (
      <label>
        Part names, one per line. Add a statement after a vertical bar.
        <textarea value={form.parts} onChange={(event) => update({ parts: event.target.value })} />
      </label>
    )
  }

  if (form.kind === "merge") {
    return (
      <>
        <fieldset>
          <legend>Merge with</legend>
          {entries
            .filter((entry) => entry.ref !== form.target)
            .map((entry) => (
              <label className="checkbox" key={entry.ref}>
                <input
                  checked={form.extraTargets.includes(entry.ref)}
                  type="checkbox"
                  onChange={() => toggleTarget(form, update, entry.ref)}
                />
                {entry.label} ({entry.kindLabel})
              </label>
            ))}
        </fieldset>
        <label>
          Merged name
          <input value={form.title} onChange={(event) => update({ title: event.target.value })} />
        </label>
        <label>
          Merged statement
          <textarea
            value={form.statement}
            onChange={(event) => update({ statement: event.target.value })}
          />
        </label>
      </>
    )
  }

  const parents = entries.filter((entry) => architectureKind(entry.technical.kind))
  const sources = entries.filter((entry) => entry.technical.kind === "component")

  return (
    <>
      <label>
        Component name
        <input value={form.title} onChange={(event) => update({ title: event.target.value })} />
      </label>
      <label>
        Boundary type
        <select
          value={form.componentKind}
          onChange={(event) => update({ componentKind: event.target.value })}
        >
          <option value="component">Component</option>
          <option value="system">System</option>
          <option value="data_store">Data store</option>
          <option value="external">External system</option>
        </select>
      </label>
      <label>
        Inside
        <select value={form.parent} onChange={(event) => update({ parent: event.target.value })}>
          <option value="">Choose a parent</option>
          {parents.map((entry) => (
            <option key={entry.ref} value={entry.ref}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Replace link to
        <select value={form.source} onChange={(event) => update({ source: event.target.value })}>
          <option value="">Choose only when several links exist</option>
          {sources.map((entry) => (
            <option key={entry.ref} value={entry.ref}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

function toggleTarget(
  form: OperationForm,
  update: (patch: Partial<OperationForm>) => void,
  ref: string,
): void {
  const extraTargets = form.extraTargets.includes(ref)
    ? form.extraTargets.filter((candidate) => candidate !== ref)
    : [...form.extraTargets, ref]

  update({ extraTargets })
}

function architectureKind(kind: string): boolean {
  return kind === "system" || kind === "component"
}
