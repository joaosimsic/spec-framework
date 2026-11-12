import { useCallback, useState } from "react"
import type { ApiFailure } from "../api"
import { getChange, postCheck } from "../api"
import { ChangePanels } from "../components/ChangePanels"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchCheckView } from "../../types"
import type { WorkbenchViewProps } from "./types"

export function ReviewView({ onStatus }: WorkbenchViewProps) {
  const load = useCallback(() => getChange(), [])
  const change = useApiResource(load)
  const [check, setCheck] = useState<WorkbenchCheckView | null>(null)
  const [checkFailure, setCheckFailure] = useState<ApiFailure | null>(null)
  const [structural, setStructural] = useState(false)
  const [checking, setChecking] = useState(false)

  async function runCheck(): Promise<void> {
    setChecking(true)
    const [view, failure] = await postCheck(structural)
    setChecking(false)
    setCheck(view)
    setCheckFailure(failure)
    if (view !== null) onStatus("Checks completed.")
  }

  if (change.loading) return <LoadingPanel label="Loading the proposal review." />
  if (change.failure !== null) {
    return <FailurePanel failure={change.failure} onRetry={() => void change.reload()} />
  }
  if (change.data === null) return <EmptyPanel>No proposal is available for review.</EmptyPanel>

  const view = change.data

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Proposal review</p>
        <h2>{view.proposal.label}</h2>
        <p>
          {view.proposal.state} by {view.proposal.author}. Approval remains a human CLI action.
        </p>
      </section>

      <section aria-labelledby="check-heading" className="panel">
        <h2 id="check-heading">Checks</h2>
        <label className="checkbox">
          <input
            checked={structural}
            type="checkbox"
            onChange={(event) => setStructural(event.target.checked)}
          />
          Structural checks only
        </label>
        <div className="button-row">
          <button disabled={checking} type="button" onClick={() => void runCheck()}>
            {checking ? "Running checks" : "Run checks"}
          </button>
        </div>
        {checkFailure !== null && <FailurePanel failure={checkFailure} />}
        {check !== null && (
          <>
            <p>
              {check.errors} errors and {check.warnings} warnings.
            </p>
            {check.findings.length === 0 && <p className="empty">No findings.</p>}
            <ul className="finding-list">
              {check.findings.map((finding, index) => (
                <li className={finding.level === "error" ? "finding-error" : ""} key={index}>
                  <strong>{finding.level}</strong> {finding.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <ChangePanels change={view} />
    </>
  )
}
