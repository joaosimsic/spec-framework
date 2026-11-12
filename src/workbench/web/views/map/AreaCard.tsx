import type { WorkbenchCurationRequest, WorkbenchMappingArea } from "../../../types"
import { AreaAdjustment } from "./AreaAdjustment"

export function AreaCard({
  area,
  areas,
  onAction,
}: {
  area: WorkbenchMappingArea
  areas: WorkbenchMappingArea[]
  onAction(actions: WorkbenchCurationRequest[]): Promise<boolean>
}) {
  return (
    <article className="queue-card">
      <div className="entry-heading">
        <h3>{area.label}</h3>
        <span className="pill">{area.kindLabel}</span>
        <span className="pill">{area.confidenceLabel}</span>
        <span className="state">{area.state}</span>
      </div>
      <p>{area.prompt}</p>
      {area.owner !== undefined && <p className="meta">Owner: {area.owner}</p>}
      {area.responsibility !== undefined && <p className="meta">{area.responsibility}</p>}
      {area.boundary !== undefined && <p className="meta">Boundary: {area.boundary}</p>}

      <div className="button-row">
        <button type="button" onClick={() => void onAction([{ kind: "accept", target: area.ref }])}>
          Accept
        </button>
        <button type="button" onClick={() => void onAction([{ kind: "reject", target: area.ref }])}>
          Reject
        </button>
      </div>

      <AreaAdjustment area={area} areas={areas} onAction={onAction} />
    </article>
  )
}
