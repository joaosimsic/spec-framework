import { useEffect, useRef, useState } from "react"
import { describeFailure, getSession, setCsrfToken } from "./api"
import { WorkbenchErrorBoundary } from "./components/WorkbenchErrorBoundary"
import { EvolutionView } from "./views/EvolutionView"
import { FindingsView } from "./views/FindingsView"
import { FlowsView } from "./views/FlowsView"
import { GeneratedDocumentsView } from "./views/GeneratedDocumentsView"
import { SystemView } from "./views/SystemView"
import type { WorkbenchSession } from "../types"

type ViewName = "system" | "flows" | "findings" | "evolution" | "documents"

const VIEW_LABELS: Record<ViewName, string> = {
  system: "System",
  flows: "Flows",
  findings: "Findings",
  evolution: "Evolution",
  documents: "Generated documents",
}

export function App() {
  const [session, setSession] = useState<WorkbenchSession | null>(null)
  const [view, setView] = useState<ViewName>("system")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    mainRef.current?.focus()
  }, [view])

  async function load(): Promise<void> {
    const [loadedSession, sessionError] = await getSession()
    if (sessionError !== null || loadedSession === null) {
      setError(describeFailure(sessionError))
      return
    }
    setCsrfToken(loadedSession.csrf_token)
    setSession(loadedSession)
    setError(null)
  }

  const views = session === null ? [] : session.views.filter(isViewName)

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div>
          <p className="eyebrow">Spec framework</p>
          <h1>Generated workbench</h1>
        </div>
        {session !== null && (
          <div className="session-summary" aria-label="Session status">
            <span className="pill">generated</span>
            {session.snapshot_id !== null && (
              <span className="proposal-line">
                {session.snapshot_id.slice(0, 13)}
                <small>{session.commit.slice(0, 8)}</small>
              </span>
            )}
            {session.dirty && <span className="pill pill-warn">Dirty workspace</span>}
          </div>
        )}
      </header>

      {session !== null && (
        <div className="shell shell-graph">
          <nav aria-label="Views" className="side-nav">
            {views.map((item) => (
              <button
                type="button"
                key={item}
                aria-current={view === item ? "page" : undefined}
                className={view === item ? "nav-active" : undefined}
                onClick={() => setView(item)}
              >
                {VIEW_LABELS[item]}
              </button>
            ))}
          </nav>

          <main id="main" ref={mainRef} tabIndex={-1} className="graph-main">
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {status}
            </div>
            {error !== null && (
              <div role="alert" className="error-panel">
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            )}
            {session.snapshot_id === null && (
              <div className="panel notice-warn" role="status">
                <p>No generated snapshot is available. Run `spec analyze`.</p>
              </div>
            )}
            <WorkbenchErrorBoundary key={view}>
              <ViewContent
                view={view}
                session={session}
                onStatus={setStatus}
                onError={(message) => setError(message)}
              />
            </WorkbenchErrorBoundary>
          </main>
        </div>
      )}

      {session === null && error === null && <main id="main">Loading generated output.</main>}
      {session === null && error !== null && (
        <main id="main">
          <div role="alert" className="error-panel">
            <p>{error}</p>
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </main>
      )}
    </>
  )
}

function ViewContent({
  view,
  ...props
}: {
  view: ViewName
  session: WorkbenchSession
  onStatus(message: string): void
  onError(message: string): void
}) {
  switch (view) {
    case "system":
      return <SystemView {...props} />
    case "flows":
      return <FlowsView {...props} />
    case "findings":
      return <FindingsView {...props} />
    case "evolution":
      return <EvolutionView {...props} />
    case "documents":
      return <GeneratedDocumentsView {...props} />
  }
}

function isViewName(value: string): value is ViewName {
  return value in VIEW_LABELS
}
