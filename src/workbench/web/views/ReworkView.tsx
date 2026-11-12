import { useCallback, useState } from "react"
import type { ProposalOperation } from "../../../change"
import type { ApiFailure } from "../api"
import { getChange, postOperations } from "../api"
import { ChangePanels } from "../components/ChangePanels"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import { OperationComposer } from "./rework/OperationComposer"
import type { WorkbenchViewProps } from "./types"

export function ReworkView({ graph, session, onStatus, onRefresh }: WorkbenchViewProps) {
  const load = useCallback(() => getChange(), [])
  const change = useApiResource(load)
  const [busy, setBusy] = useState(false)
  const [actionFailure, setActionFailure] = useState<ApiFailure | null>(null)
  const proposal = session.proposal

  async function apply(operation: ProposalOperation): Promise<boolean> {
    if (proposal === null || busy) return false

    setBusy(true)
    setActionFailure(null)
    const [view, failure] = await postOperations(proposal.ref, [operation], true)
    setBusy(false)
    if (failure !== null || view === null) {
      setActionFailure(failure)
      return false
    }

    change.setData(view)
    onStatus("Proposal operation applied in simulation.")
    await onRefresh()
    return true
  }

  if (change.loading) return <LoadingPanel label="Loading the change simulation." />
  if (change.failure !== null) {
    return <FailurePanel failure={change.failure} onRetry={() => void change.reload()} />
  }
  if (change.data === null) return <EmptyPanel>No change report is available.</EmptyPanel>

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Refactor mode</p>
        <h2>{change.data.proposal.label}</h2>
        <p>
          {change.data.proposal.state}. Review the simulation before applying changes or seeking
          approval.
        </p>
      </section>

      {busy && <p role="status">Applying the proposal operation.</p>}
      {actionFailure !== null && (
        <FailurePanel
          failure={actionFailure}
          actionLabel="Dismiss"
          onRetry={() => {
            setActionFailure(null)
          }}
        />
      )}

      {proposal !== null && (
        <OperationComposer busy={busy} entries={graph.entries} onApply={apply} />
      )}

      <ChangePanels change={change.data} />
    </>
  )
}
