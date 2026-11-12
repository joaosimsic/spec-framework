import type { OperationForm } from "./operation-form"

export function ContractOperationFields({
  form,
  update,
}: {
  form: OperationForm
  update(patch: Partial<OperationForm>): void
}) {
  return (
    <>
      <label>
        Compatibility
        <select
          value={form.contractCompatibility}
          onChange={(event) => update({ contractCompatibility: event.target.value })}
        >
          <option value="">Keep current</option>
          <option value="none">No compatibility promise</option>
          <option value="backward">Backward compatible</option>
          <option value="forward">Forward compatible</option>
          <option value="full">Fully compatible</option>
        </select>
      </label>
      <label>
        Contract name
        <input
          value={form.contractTitle}
          onChange={(event) => update({ contractTitle: event.target.value })}
        />
      </label>
      <label>
        Owner
        <input
          value={form.contractOwner}
          onChange={(event) => update({ contractOwner: event.target.value })}
        />
      </label>
    </>
  )
}
