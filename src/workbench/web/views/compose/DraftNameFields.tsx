import type { DraftForm } from "../../../forms/draft-builder"

export function DraftNameFields({
  form,
  update,
}: {
  form: DraftForm
  update(patch: Partial<DraftForm>): void
}) {
  const short = form.mode === "question"
  return (
    <>
      {!short && form.mode !== "retire" && (
        <label>
          Name
          <input value={form.title} onChange={(event) => update({ title: event.target.value })} />
        </label>
      )}
      {form.mode !== "retire" && (
        <label>
          {short ? "Question" : "Statement"}
          <textarea
            value={form.statement}
            onChange={(event) => update({ statement: event.target.value })}
          />
        </label>
      )}
      {(form.mode === "requirement" || form.mode === "acceptance") && (
        <label>
          Rationale
          <input
            value={form.rationale}
            onChange={(event) => update({ rationale: event.target.value })}
          />
        </label>
      )}
      {form.mode !== "revise" && form.mode !== "retire" && (
        <label>
          Owner
          <input value={form.owner} onChange={(event) => update({ owner: event.target.value })} />
        </label>
      )}
    </>
  )
}
