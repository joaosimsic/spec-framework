import type { OperationForm } from "./operation-form"

export function DecisionOperationFields({
  form,
  update,
}: {
  form: OperationForm
  update(patch: Partial<OperationForm>): void
}) {
  return (
    <>
      {form.kind === "record-decision" ? (
        <>
          <label>
            Decision
            <input value={form.title} onChange={(event) => update({ title: event.target.value })} />
          </label>
          <label>
            Statement
            <textarea
              value={form.statement}
              onChange={(event) => update({ statement: event.target.value })}
            />
          </label>
        </>
      ) : (
        <label>
          Question
          <textarea
            value={form.question}
            onChange={(event) => update({ question: event.target.value })}
          />
        </label>
      )}
      <label>
        Owner
        <input value={form.owner} onChange={(event) => update({ owner: event.target.value })} />
      </label>
    </>
  )
}
