import { useState } from "react"
import type { ProposalOperation } from "../../../../change"
import type { DisplayEntry } from "../../../../model"

type OperationKind = "rename" | "deprecate" | "move"

export function OperationComposer({
  entries,
  busy,
  onApply,
}: {
  entries: DisplayEntry[]
  busy: boolean
  onApply(operation: ProposalOperation): Promise<boolean>
}) {
  const [kind, setKind] = useState<OperationKind>("rename")
  const [target, setTarget] = useState(entries[0]?.ref ?? "")
  const [destination, setDestination] = useState(entries[1]?.ref ?? "")
  const [title, setTitle] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const canSubmit =
    target !== "" &&
    (kind !== "rename" || title.trim() !== "") &&
    (kind !== "move" || destination !== "") &&
    (kind !== "deprecate" || confirmed)

  async function submit(): Promise<void> {
    const operation = buildOperation(kind, target, destination, title)
    if (operation === null) return

    const succeeded = await onApply(operation)
    if (!succeeded) return

    setTitle("")
    setConfirmed(false)
  }

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
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as OperationKind)
              setConfirmed(false)
            }}
          >
            <option value="rename">Rename</option>
            <option value="deprecate">Retire</option>
            <option value="move">Move</option>
          </select>
        </label>

        <label>
          Item
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            {entries.map((entry) => (
              <option key={entry.ref} value={entry.ref}>
                {entry.label} ({entry.kindLabel})
              </option>
            ))}
          </select>
        </label>

        {kind === "rename" && (
          <label>
            New name
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
        )}

        {kind === "move" && (
          <label>
            Move under
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              {entries.map((entry) => (
                <option key={entry.ref} value={entry.ref}>
                  {entry.label} ({entry.kindLabel})
                </option>
              ))}
            </select>
          </label>
        )}

        {kind === "deprecate" && (
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
      <button disabled={busy || !canSubmit} type="button" onClick={() => void submit()}>
        Apply to proposal
      </button>
    </section>
  )
}

function buildOperation(
  kind: OperationKind,
  target: string,
  destination: string,
  title: string,
): ProposalOperation | null {
  switch (kind) {
    case "rename":
      return { kind: "rename", target, title: title.trim() }
    case "deprecate":
      return { kind: "deprecate", target }
    case "move":
      return { kind: "move", target, to: destination }
  }
}
