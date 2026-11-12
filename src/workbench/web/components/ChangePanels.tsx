import type { WorkbenchChangeView, WorkbenchDiffView, WorkbenchImpactView } from "../../types"
import { NamedItemList } from "./NamedItemList"

export function ChangePanels({ change }: { change: WorkbenchChangeView }) {
  return (
    <>
      <section aria-labelledby="operations-heading" className="panel">
        <h2 id="operations-heading">Proposed operations</h2>
        <NamedItemList
          items={change.operations}
          empty="No operations recorded for this proposal."
        />
      </section>
      <DiffPanel diff={change.diff} />
      <ImpactPanel impact={change.impact} />
    </>
  )
}

export function DiffPanel({ diff }: { diff: WorkbenchDiffView }) {
  if (!diff.available) {
    return (
      <section className="panel">
        <h2>Before and after</h2>
        <p className="empty">{diff.reason ?? "No change simulation is available."}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="diff-heading" className="panel">
      <h2 id="diff-heading">Before and after</h2>
      <div className="change-columns">
        <div>
          <h3>Added</h3>
          <NamedItemList items={diff.added} empty="Nothing added." />
        </div>
        <div>
          <h3>Removed</h3>
          <NamedItemList items={diff.removed} empty="Nothing removed." />
        </div>
      </div>
      <h3>Modified</h3>
      {diff.modified.length === 0 && <p className="empty">Nothing modified.</p>}
      {diff.modified.length > 0 && (
        <ul className="named-list">
          {diff.modified.map((item, index) => (
            <li key={`${item.ref ?? item.label}-${index}`}>
              <span>
                {item.previousLabel === undefined ? (
                  item.label
                ) : (
                  <>
                    {item.previousLabel} to {item.label}
                  </>
                )}
              </span>
              <span className="pill">{item.kindLabel}</span>
              <span className="state">{item.changed.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ImpactPanel({ impact }: { impact: WorkbenchImpactView }) {
  if (!impact.available) {
    return (
      <section className="panel">
        <h2>Impact</h2>
        <p className="empty">{impact.reason ?? "No impact analysis is available."}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="impact-heading" className="panel">
      <h2 id="impact-heading">Impact</h2>
      <h3>Changed</h3>
      <NamedItemList items={impact.changed} empty="Nothing changed." />
      <h3>Affected</h3>
      <NamedItemList items={impact.affected} empty="Nothing else is affected." />
      <h3>Invalidated evidence</h3>
      <NamedItemList items={impact.invalidatedEvidence} empty="No evidence is invalidated." />
      <h3>Approvals to renew</h3>
      <NamedItemList items={impact.approvalsToRenew} empty="No approvals need renewal." />
      <h3>Open questions</h3>
      <NamedItemList items={impact.openQuestions} empty="No open questions block this change." />
    </section>
  )
}
