import { useCallback, useEffect, useRef, type RefObject } from "react"
import { getTechnical } from "../api"
import type { WorkbenchTechnicalView } from "../../types"
import { FailurePanel, LoadingPanel } from "./Panels"
import { useApiResource } from "./useApiResource"

export function TechnicalDetails({
  proposalRef,
  onClose,
}: {
  proposalRef: string
  onClose(): void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const load = useCallback(() => getTechnical(proposalRef), [proposalRef])
  const technical = useApiResource(load)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return

      keepFocusInside(event, dialogRef)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        aria-labelledby="technical-heading"
        aria-modal="true"
        className="dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Full identity</p>
            <h2 id="technical-heading">Technical details</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {technical.loading && <LoadingPanel label="Loading technical details." />}
        {technical.failure !== null && (
          <FailurePanel failure={technical.failure} onRetry={() => void technical.reload()} />
        )}
        {technical.data !== null && <TechnicalContent technical={technical.data} />}
      </div>
    </div>
  )
}

function TechnicalContent({ technical }: { technical: WorkbenchTechnicalView }) {
  const proposal = technical.proposal
  const mapping = technical.mapping

  return (
    <div className="dialog-body">
      <section>
        <h3>Proposal</h3>
        <dl className="technical-grid">
          <dt>Identifier</dt>
          <dd>{proposal.id}</dd>
          <dt>Direction</dt>
          <dd>{proposal.direction}</dd>
          <dt>Mode</dt>
          <dd>{proposal.mode}</dd>
          <dt>Status</dt>
          <dd>{proposal.status}</dd>
          <dt>Author</dt>
          <dd>{proposal.author}</dd>
          <dt>Branch</dt>
          <dd>{proposal.branch}</dd>
          <dt>Base commit</dt>
          <dd>{proposal.base_commit}</dd>
          <dt>Created</dt>
          <dd>{proposal.created_at}</dd>
        </dl>
      </section>

      <section>
        <h3>Graph</h3>
        <dl className="technical-grid">
          <dt>Commit</dt>
          <dd>{technical.graph.commit}</dd>
          <dt>Dirty</dt>
          <dd>{technical.graph.dirty ? "yes" : "no"}</dd>
          <dt>Elements</dt>
          <dd>{technical.graph.elements.length}</dd>
          <dt>Evidence</dt>
          <dd>{technical.graph.evidence.length}</dd>
          <dt>Findings</dt>
          <dd>{technical.graph.findings.length}</dd>
          <dt>Workspace</dt>
          <dd>{technical.graph.workspace}</dd>
        </dl>
      </section>

      <section>
        <h3>Findings</h3>
        {technical.graph.findings.length === 0 && <p className="empty">No graph findings.</p>}
        {technical.graph.findings.length > 0 && (
          <table className="technical-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Code</th>
                <th>Item</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {technical.graph.findings.map((finding, index) => (
                <tr key={`${finding.code}-${finding.id ?? "graph"}-${index}`}>
                  <td>{finding.level}</td>
                  <td>{finding.code}</td>
                  <td>{finding.id ?? ""}</td>
                  <td>{finding.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Evidence</h3>
        {technical.graph.evidence.length === 0 && <p className="empty">No evidence records.</p>}
        {technical.graph.evidence.length > 0 && (
          <table className="technical-table">
            <thead>
              <tr>
                <th>Identifier</th>
                <th>Kind</th>
                <th>Method</th>
                <th>Result</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {technical.graph.evidence.map((evidence) => (
                <tr key={evidence.id}>
                  <td>{evidence.id}</td>
                  <td>{evidence.kind ?? ""}</td>
                  <td>{evidence.method ?? ""}</td>
                  <td>{evidence.result ?? ""}</td>
                  <td>{evidence.hash ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Mapping</h3>
        <p>
          {mapping === null
            ? "No mapping curation is stored for this proposal."
            : `${mapping.decisions.length} decisions, ${mapping.resolvedIds.length} resolved areas, ${mapping.questions.length} open questions.`}
        </p>
      </section>

      <section>
        <h3>Tool versions</h3>
        <pre>{formatJson(technical.toolVersions)}</pre>
      </section>

      <section>
        <h3>Adapters</h3>
        <pre>{formatJson(technical.adapters)}</pre>
      </section>

      <section>
        <h3>Approval lock</h3>
        <pre>{formatJson(technical.lock)}</pre>
      </section>

      <details>
        <summary>Graph identity records</summary>
        <table className="technical-table">
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Title</th>
              <th>Owner</th>
              <th>Confidence</th>
              <th>Provenance</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>
            {technical.graph.elements.map((element) => (
              <tr key={element.id}>
                <td>{element.id}</td>
                <td>{element.kind}</td>
                <td>{element.status ?? ""}</td>
                <td>{element.title}</td>
                <td>{element.owner ?? ""}</td>
                <td>{element.confidence ?? ""}</td>
                <td>{element.provenance ?? ""}</td>
                <td>{element.links.map((link) => `${link.type} -> ${link.to}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details>
        <summary>Raw graph JSON</summary>
        <pre>{formatJson(technical.graph)}</pre>
      </details>
    </div>
  )
}

function keepFocusInside(event: KeyboardEvent, dialogRef: RefObject<HTMLDivElement | null>): void {
  const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  if (focusable === undefined || focusable.length === 0) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (first === undefined || last === undefined) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "Not available"

  return JSON.stringify(value, null, 2)
}
