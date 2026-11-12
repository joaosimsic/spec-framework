import { useCallback } from "react"
import { getContext } from "../api"
import { EntryList } from "../components/EntryList"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchViewProps } from "./types"

export function ComposeView({ session, onStatus }: WorkbenchViewProps) {
  const load = useCallback(() => getContext([]), [])
  const context = useApiResource(load)

  if (context.loading) return <LoadingPanel label="Loading the scratch context." />
  if (context.failure !== null) {
    return <FailurePanel failure={context.failure} onRetry={() => void context.reload()} />
  }
  if (context.data === null) return <EmptyPanel>No scratch context is available.</EmptyPanel>

  const view = context.data

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Scratch mode</p>
        <h2>{session.proposal?.label ?? view.proposal?.label ?? "New feature slice"}</h2>
        <p>
          Shape the proposed slice here. Save decisions as named elements, then validate and approve
          from the CLI.
        </p>
      </section>

      {view.prompts.length > 0 && (
        <section aria-labelledby="prompts-heading" className="panel">
          <h2 id="prompts-heading">Decisions to make</h2>
          <ul className="plain-list">
            {view.prompts.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </section>
      )}

      {view.next.length > 0 && (
        <section aria-labelledby="next-heading" className="panel">
          <h2 id="next-heading">Next steps</h2>
          <ol className="plain-list">
            {view.next.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {view.blockers.length > 0 && (
        <section aria-labelledby="compose-blockers" className="panel notice-warn">
          <h2 id="compose-blockers">Blockers</h2>
          <ul>
            {view.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="slice-heading" className="panel">
        <h2 id="slice-heading">Proposed slice</h2>
        <EntryList entries={view.entries} />
        <button
          type="button"
          onClick={() => {
            void context.reload().then(() => onStatus("Context refreshed."))
          }}
        >
          Refresh context
        </button>
      </section>
    </>
  )
}
