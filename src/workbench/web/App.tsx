import { useEffect, useRef, useState } from "react"
import type { ApiFailure } from "./api"
import { getGraph, getSession, setCsrfToken } from "./api"
import { TechnicalDetails } from "./components/TechnicalDetails"
import { ComposeView } from "./views/ComposeView"
import { MapView } from "./views/MapView"
import { OverviewView } from "./views/OverviewView"
import { ReviewView } from "./views/ReviewView"
import { ReworkView } from "./views/ReworkView"
import type { WorkbenchGraphView, WorkbenchSession } from "../types"

type ViewName = "overview" | "map" | "compose" | "rework" | "review"

const VIEW_LABELS: Record<ViewName, string> = {
  overview: "Overview",
  map: "Map",
  compose: "Compose",
  rework: "Rework",
  review: "Review",
}

export function App() {
  const [session, setSession] = useState<WorkbenchSession | null>(null)
  const [graph, setGraph] = useState<WorkbenchGraphView | null>(null)
  const [view, setView] = useState<ViewName>("overview")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [technicalOpen, setTechnicalOpen] = useState(false)
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
      setError(describe(sessionError))
      return
    }

    setCsrfToken(loadedSession.csrf_token)
    const [loadedGraph, graphError] = await getGraph()
    if (graphError !== null || loadedGraph === null) {
      setError(describe(graphError))
      return
    }

    setSession(loadedSession)
    setGraph(loadedGraph)
    setView(initialView(loadedSession))
  }

  async function refresh(): Promise<void> {
    const [loadedGraph, graphError] = await getGraph()
    if (graphError !== null || loadedGraph === null) {
      setError(describe(graphError))
      return
    }

    setGraph(loadedGraph)
  }

  const views = session === null ? [] : availableViews(session)
  const proposalRef = session?.proposal?.ref ?? null

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div>
          <p className="eyebrow">Spec framework</p>
          <h1>Workbench</h1>
        </div>
        {session !== null && (
          <div className="session-summary" aria-label="Session status">
            <span className="pill">{session.mode}</span>
            {session.dirty && <span className="pill pill-warn">Local preview</span>}
            {session.proposal !== null && (
              <span className="proposal-line">
                {session.proposal.label}
                <small>
                  {session.proposal.state} - {session.proposal.author}
                </small>
              </span>
            )}
          </div>
        )}
        <div className="header-actions">
          <button type="button" onClick={() => setTechnicalOpen(true)} disabled={proposalRef === null}>
            Technical details
          </button>
        </div>
      </header>

      {session !== null && graph !== null && (
        <div className="shell">
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

          <main id="main" ref={mainRef} tabIndex={-1}>
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
            <ViewContent
              view={view}
              graph={graph}
              session={session}
              onStatus={setStatus}
              onError={(message) => setError(message)}
              onRefresh={refresh}
            />
          </main>
        </div>
      )}

      {session === null && error === null && <main id="main">Loading the spec graph.</main>}
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

      {technicalOpen && proposalRef !== null && (
        <TechnicalDetails proposalRef={proposalRef} onClose={() => setTechnicalOpen(false)} />
      )}
    </>
  )
}

function ViewContent({
  view,
  ...props
}: {
  view: ViewName
  graph: WorkbenchGraphView
  session: WorkbenchSession
  onStatus(message: string): void
  onError(message: string): void
  onRefresh(): Promise<void>
}) {
  switch (view) {
    case "map":
      return <MapView {...props} />
    case "compose":
      return <ComposeView {...props} />
    case "rework":
      return <ReworkView {...props} />
    case "review":
      return <ReviewView {...props} />
    case "overview":
      return <OverviewView {...props} />
  }
}

function availableViews(session: WorkbenchSession): ViewName[] {
  const views = session.views.filter(isViewName)
  for (const fallback of ["overview", "review", "technical"] as const) {
    if (fallback !== "technical" && !views.includes(fallback)) views.push(fallback)
  }

  return [...new Set(views)]
}

function initialView(session: WorkbenchSession): ViewName {
  if (session.mode === "mapping") return "map"
  if (session.mode === "scratch") return "compose"
  if (session.mode === "refactor") return "rework"

  return "overview"
}

function isViewName(value: string): value is ViewName {
  return value in VIEW_LABELS
}

function describe(failure: ApiFailure | null): string {
  if (failure === null) return "The workbench could not load."
  const choices = failure.choices?.map((choice) => `${choice.label} (${choice.context})`)

  return [failure.message, ...(choices ?? [])].join("\n")
}
