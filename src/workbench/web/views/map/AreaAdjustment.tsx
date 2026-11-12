import { useState } from "react"
import type { WorkbenchCurationRequest, WorkbenchMappingArea } from "../../../types"

export type AreaAction =
  | ""
  | "rename"
  | "merge"
  | "split"
  | "set-owner"
  | "set-responsibility"
  | "set-boundary"
  | "open-question"

export function AreaAdjustment({
  area,
  areas,
  onAction,
}: {
  area: WorkbenchMappingArea
  areas: WorkbenchMappingArea[]
  onAction(actions: WorkbenchCurationRequest[]): Promise<boolean>
}) {
  const [action, setAction] = useState<AreaAction>("")
  const [value, setValue] = useState("")
  const [blocking, setBlocking] = useState(false)
  const [mergeTargets, setMergeTargets] = useState<string[]>([])
  const canSubmit =
    action !== "" &&
    (action !== "merge" || mergeTargets.length > 0) &&
    (action === "merge" || value.trim() !== "")

  async function submit(): Promise<void> {
    const request = adjustment(action, area, value, blocking, mergeTargets)
    if (request === null) return

    const succeeded = await onAction([request])
    if (!succeeded) return

    setAction("")
    setValue("")
    setBlocking(false)
    setMergeTargets([])
  }

  function toggleMergeTarget(target: string): void {
    setMergeTargets((current) =>
      current.includes(target)
        ? current.filter((candidate) => candidate !== target)
        : [...current, target],
    )
  }

  return (
    <div className="adjustment">
      <label>
        Adjust this area
        <select
          value={action}
          onChange={(event) => {
            setAction(event.target.value as AreaAction)
            setValue("")
          }}
        >
          <option value="">Choose an adjustment</option>
          <option value="rename">Rename</option>
          <option value="merge">Merge with other areas</option>
          <option value="split">Split into parts</option>
          <option value="set-owner">Set owner</option>
          <option value="set-responsibility">Set responsibility</option>
          <option value="set-boundary">Set boundary</option>
          <option value="open-question">Record an open question</option>
        </select>
      </label>

      {action === "merge" && (
        <fieldset>
          <legend>Merge with</legend>
          {areas
            .filter((candidate) => candidate.ref !== area.ref)
            .map((candidate) => (
              <label className="checkbox" key={candidate.ref}>
                <input
                  checked={mergeTargets.includes(candidate.ref)}
                  type="checkbox"
                  onChange={() => toggleMergeTarget(candidate.ref)}
                />
                {candidate.label}
              </label>
            ))}
        </fieldset>
      )}

      {action === "rename" && (
        <label>
          New name
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      )}

      {action === "merge" && (
        <label>
          Merged name
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      )}

      {action === "split" && (
        <label>
          Part names, one per line
          <textarea value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      )}

      {action === "set-owner" && (
        <label>
          Owner
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      )}

      {action === "set-responsibility" && (
        <label>
          Responsibility
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      )}

      {action === "set-boundary" && (
        <label>
          Boundary
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      )}

      {action === "open-question" && (
        <>
          <label>
            Question
            <textarea value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <label className="checkbox">
            <input
              checked={blocking}
              type="checkbox"
              onChange={(event) => setBlocking(event.target.checked)}
            />
            This question blocks approval
          </label>
        </>
      )}

      {action !== "" && (
        <button disabled={!canSubmit} type="button" onClick={() => void submit()}>
          Apply adjustment
        </button>
      )}
    </div>
  )
}

function adjustment(
  action: AreaAction,
  area: WorkbenchMappingArea,
  value: string,
  blocking: boolean,
  mergeTargets: string[],
): WorkbenchCurationRequest | null {
  switch (action) {
    case "rename":
      return { kind: "rename", target: area.ref, title: value.trim() }
    case "merge":
      return { kind: "merge", targets: [area.ref, ...mergeTargets], title: value.trim() }
    case "split":
      return {
        kind: "split",
        target: area.ref,
        parts: value
          .split("\n")
          .map((part) => part.trim())
          .filter((part) => part !== ""),
      }
    case "set-owner":
      return { kind: "set-owner", target: area.ref, owner: value.trim() }
    case "set-responsibility":
      return { kind: "set-responsibility", target: area.ref, responsibility: value.trim() }
    case "set-boundary":
      return { kind: "set-boundary", target: area.ref, boundary: value.trim() }
    case "open-question":
      return { kind: "open-question", question: value.trim(), target: area.ref, blocking }
    case "":
      return null
  }
}
