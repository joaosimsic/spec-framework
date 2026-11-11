import type { DisplayEntry } from "../../../model"

export function EntryList({ entries }: { entries: DisplayEntry[] }) {
  if (entries.length === 0) return <p className="empty">Nothing in the model yet.</p>

  return (
    <ul className="entry-list">
      {entries.map((entry) => (
        <li key={entry.ref}>
          <article className="entry-card">
            <div className="entry-heading">
              <h3>{entry.label}</h3>
              <span className="pill">{entry.kindLabel}</span>
              <span className="state">{entry.state}</span>
            </div>
            {entry.blockers.length > 0 && (
              <div className="notice notice-warn">
                <strong>Needs attention</strong>
                <ul>
                  {entry.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}
            {entry.relationships.length > 0 && (
              <div className="relationship-groups">
                {entry.relationships.map((group) => (
                  <p key={group.label}>
                    <strong>{group.label}:</strong>{" "}
                    {group.items.map((item) => item.label).join(", ")}
                  </p>
                ))}
              </div>
            )}
            {entry.openQuestions.length > 0 && (
              <div>
                <strong>Open questions</strong>
                <ul>
                  {entry.openQuestions.map((question) => (
                    <li key={question.ref}>{question.label}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        </li>
      ))}
    </ul>
  )
}
