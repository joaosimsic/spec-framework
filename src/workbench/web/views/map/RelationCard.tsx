import type { WorkbenchCurationRequest, WorkbenchMappingRelation } from "../../../types"

export function RelationCard({
  relation,
  onAction,
}: {
  relation: WorkbenchMappingRelation
  onAction(actions: WorkbenchCurationRequest[]): Promise<boolean>
}) {
  const common = {
    source: relation.sourceRef,
    target: relation.targetRef,
    type: relation.type,
  }

  return (
    <article className="queue-card">
      <div className="entry-heading">
        <h3>{relation.label}</h3>
        <span className="pill">{relation.confidenceLabel}</span>
      </div>
      <p>{relation.prompt}</p>
      <div className="button-row">
        <button
          type="button"
          onClick={() => void onAction([{ kind: "accept-relation", ...common }])}
        >
          Accept relation
        </button>
        <button
          type="button"
          onClick={() => void onAction([{ kind: "reject-relation", ...common }])}
        >
          Reject relation
        </button>
      </div>
    </article>
  )
}
