import { useCallback, useState } from "react"
import type { ApiFailure } from "../api"
import { getMapping, postMappingActions } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchCurationRequest } from "../../types"
import { AreaCard } from "./map/AreaCard"
import { RelationCard } from "./map/RelationCard"
import type { WorkbenchViewProps } from "./types"

export function MapView({ onStatus, onRefresh }: WorkbenchViewProps) {
  const load = useCallback(() => getMapping(), [])
  const mapping = useApiResource(load)
  const [busy, setBusy] = useState(false)
  const [actionFailure, setActionFailure] = useState<ApiFailure | null>(null)

  async function apply(actions: WorkbenchCurationRequest[]): Promise<boolean> {
    if (busy) return false

    setBusy(true)
    setActionFailure(null)
    const [view, failure] = await postMappingActions(actions)
    setBusy(false)
    if (failure !== null || view === null) {
      setActionFailure(failure)
      return false
    }

    mapping.setData(view)
    onStatus("Mapping decision recorded.")
    await onRefresh()
    return true
  }

  if (mapping.loading) return <LoadingPanel label="Loading the mapping review." />
  if (mapping.failure !== null) {
    return <FailurePanel failure={mapping.failure} onRetry={() => void mapping.reload()} />
  }
  if (mapping.data === null) return <EmptyPanel>No mapping review is open.</EmptyPanel>

  const view = mapping.data

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Mapping mode</p>
        <h2>{view.direction}</h2>
        <p>{view.state}. Accept or correct the areas and relations that code cannot settle.</p>
      </section>

      <div className="stat-grid">
        <Stat label="Areas without owner" value={view.gaps.areasWithoutOwner} />
        <Stat label="Areas without responsibility" value={view.gaps.areasWithoutResponsibility} />
        <Stat label="Relations needing review" value={view.gaps.relationsNeedingReview} />
        <Stat label="Unresolved requirement links" value={view.gaps.unresolvedRequirementLinks} />
      </div>

      {busy && <p role="status">Saving the mapping decision.</p>}
      {actionFailure !== null && (
        <FailurePanel
          failure={actionFailure}
          actionLabel="Dismiss"
          onRetry={() => {
            setActionFailure(null)
          }}
        />
      )}

      {view.questions.length > 0 && (
        <section aria-labelledby="mapping-questions" className="panel">
          <h2 id="mapping-questions">Open questions</h2>
          <ul className="plain-list">
            {view.questions.map((question) => (
              <li key={question.label}>
                {question.label}
                {question.blocking && <span className="pill pill-warn">Blocking</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="area-queue" className="panel">
        <h2 id="area-queue">Area confidence queue</h2>
        {view.areas.length === 0 && <p className="empty">No areas need review.</p>}
        {view.areas.map((area) => (
          <AreaCard area={area} areas={view.areas} key={area.ref} onAction={apply} />
        ))}
      </section>

      <section aria-labelledby="relation-queue" className="panel">
        <h2 id="relation-queue">Relation confidence queue</h2>
        {view.relations.length === 0 && <p className="empty">No relations need review.</p>}
        {view.relations.map((relation) => (
          <RelationCard key={relation.ref} onAction={apply} relation={relation} />
        ))}
      </section>

      {view.next.length > 0 && (
        <section aria-labelledby="mapping-next" className="panel">
          <h2 id="mapping-next">Next steps</h2>
          <ol className="plain-list">
            {view.next.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="meta">Approval remains a human CLI action.</p>
        </section>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
