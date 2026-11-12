import type { DisplayEntry } from "../../../model"
import { EntryList } from "../components/EntryList"
import type { WorkbenchViewProps } from "./types"

export function OverviewView({ graph, session }: WorkbenchViewProps) {
  const entries = graph.entries
  const groups = new Map<string, DisplayEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.kindLabel) ?? []
    group.push(entry)
    groups.set(entry.kindLabel, group)
  }

  const blockers = [...new Set(entries.flatMap((entry) => entry.blockers))].sort()
  const openQuestions = entries.filter((entry) => entry.kindLabel === "Open question")
  const blocked = entries.filter((entry) => entry.blockers.length > 0)

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Model overview</p>
        <h2>{session.proposal?.label ?? "Current specification"}</h2>
        <p>
          {session.proposal === null
            ? "No proposal is open. The workbench is read-only until you start one from the CLI."
            : `${session.proposal.state} by ${session.proposal.author}.`}
        </p>
      </section>

      <div className="stat-grid">
        <Stat label="Named items" value={entries.length} />
        <Stat label="Open questions" value={openQuestions.length} />
        <Stat label="Needs attention" value={blocked.length} />
        <Stat label="Blockers" value={blockers.length} />
      </div>

      {session.proposal === null && (
        <section aria-labelledby="start-heading" className="panel">
          <h2 id="start-heading">Start a proposal</h2>
          <p>The workbench does not create proposals or approve changes. Start one from the CLI:</p>
          <ul className="plain-list">
            <li>
              <code>spec start "&lt;goal&gt;"</code> for a new feature slice.
            </li>
            <li>
              <code>spec map --review</code> to curate draft architecture from code.
            </li>
            <li>
              <code>spec refactor "&lt;direction&gt;"</code> to change an approved baseline.
            </li>
          </ul>
        </section>
      )}

      {blockers.length > 0 && (
        <section aria-labelledby="blockers-heading" className="panel notice-warn">
          <h2 id="blockers-heading">Blockers</h2>
          <ul>
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      )}

      {openQuestions.length > 0 && (
        <section aria-labelledby="questions-heading" className="panel">
          <h2 id="questions-heading">Open questions</h2>
          <EntryList entries={openQuestions} />
        </section>
      )}

      {[...groups.entries()].map(([kindLabel, group], index) => (
        <section aria-labelledby={`group-${index}`} className="panel" key={kindLabel}>
          <h2 id={`group-${index}`}>{kindLabel}</h2>
          <EntryList entries={group} />
        </section>
      ))}
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
