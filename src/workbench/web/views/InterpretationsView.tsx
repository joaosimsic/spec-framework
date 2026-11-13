import { useCallback, useState } from "react"
import { fail, ok } from "../../../core/result"
import { getCurrentProject, getProjectInterpretations } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchInterpretations } from "../../types"
import type { WorkbenchViewProps } from "./types"

export function InterpretationsView(_props: WorkbenchViewProps) {
  const load = useCallback(async () => {
    const [project, projectError] = await getCurrentProject()
    if (projectError !== null || project === null) return fail(projectError ?? missing("project"))
    const [interpretations, interpretationsError] = await getProjectInterpretations(project.id)
    if (interpretationsError !== null || interpretations === null)
      return fail(interpretationsError ?? missing("interpretations"))

    return ok(interpretations)
  }, [])
  const interpretations = useApiResource<WorkbenchInterpretations>(load)
  const [selected, setSelected] = useState<string | null>(null)
  const interpretation =
    interpretations.data?.interpretations.find((candidate) => candidate.id === selected) ?? null

  if (interpretations.loading) return <LoadingPanel label="Loading AI interpretations." />
  if (interpretations.failure !== null)
    return (
      <FailurePanel
        failure={interpretations.failure}
        onRetry={() => void interpretations.reload()}
      />
    )
  if (interpretations.data === null || interpretations.data.run === null) {
    return <EmptyPanel>No interpretations are available. Run `spec interpret`.</EmptyPanel>
  }
  const run = interpretations.data.run

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Interpretations</p>
        <h2>AI contract and verification notes</h2>
        <p className="meta">
          {run.targetCount} interpretations - {run.requestKind} - recorded {run.createdAt}. AI
          hypotheses only; no approval or verdict.
        </p>
        {run.failures.length > 0 && <p className="meta">Failures: {run.failures.length}</p>}
      </section>
      <div className="graph-layout graph-layout-inspector-hidden">
        <nav className="panel system-hierarchy" aria-label="AI interpretations">
          <h2>Targets</h2>
          {interpretations.data.interpretations.length === 0 ? (
            <p className="empty">No interpretations were produced.</p>
          ) : (
            <ul className="plain-list">
              {interpretations.data.interpretations.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={selected === item.id ? "true" : undefined}
                    onClick={() => setSelected(item.id)}
                  >
                    {item.targetId}
                  </button>
                  <span className="meta">
                    {" "}
                    {item.targetKind} - {item.confidence.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <aside className="panel graph-details" aria-live="polite">
          {interpretation === null ? (
            <>
              <h2>Run summary</h2>
              <p className="meta">
                {run.targetCount} accepted, {run.failures.length} failed.
              </p>
              {run.failures.length === 0 ? (
                <p className="empty">No failures.</p>
              ) : (
                <ul>
                  {run.failures.map((failure, index) => (
                    <li key={`${failure}:${index}`}>{failure}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h2>{interpretation.title}</h2>
              <p className="meta">
                {interpretation.targetKind} - AI-inferred - {interpretation.confidence.toFixed(2)}
              </p>
              <p>{interpretation.text}</p>
              <p className="meta">
                {interpretation.provider} / {interpretation.model} / prompt{" "}
                {interpretation.promptVersion}
              </p>
              <ul className="plain-list">
                {interpretation.evidence.map((item, index) => (
                  <li key={`${item.filePath}:${item.line}:${index}`}>
                    <strong>{item.reference}</strong>{" "}
                    <span className="meta">
                      {item.filePath}:{item.line}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  )
}

function missing(value: string): {
  code: string
  message: string
} {
  return { code: "INTERPRETATIONS-NOT-FOUND", message: `${value} unavailable` }
}
