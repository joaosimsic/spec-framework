import { useCallback, useState } from "react"
import { fail, ok } from "../../../core/result"
import { getCurrentProject, getProjectFlows } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchFlow } from "../../types"
import type { WorkbenchViewProps } from "./types"

export function FlowsView(_props: WorkbenchViewProps) {
  const load = useCallback(async () => {
    const [project, projectError] = await getCurrentProject()
    if (projectError !== null || project === null) return fail(projectError ?? missing("project"))
    const [flows, flowsError] = await getProjectFlows(project.id)
    if (flowsError !== null || flows === null) return fail(flowsError ?? missing("flows"))

    return ok(flows)
  }, [])
  const flows = useApiResource<WorkbenchFlow[]>(load)
  const [selected, setSelected] = useState<string | null>(null)
  const flow = flows.data?.find((candidate) => candidate.id === selected) ?? null

  if (flows.loading) return <LoadingPanel label="Loading functional flows." />
  if (flows.failure !== null)
    return <FailurePanel failure={flows.failure} onRetry={() => void flows.reload()} />
  if (flows.data === null || flows.data.length === 0) {
    return <EmptyPanel>No static flows are available. Run an analysis first.</EmptyPanel>
  }

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Flows</p>
        <h2>Entry points and data paths</h2>
        <p className="meta">Static evidence only. Unknowns and limits stay visible.</p>
      </section>
      <div className="graph-layout graph-layout-inspector-hidden">
        <nav className="panel system-hierarchy" aria-label="Flows">
          <h2>Entry points ({flows.data.length})</h2>
          <ul className="plain-list">
            {flows.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={selected === item.id ? "true" : undefined}
                  onClick={() => setSelected(item.id)}
                >
                  {item.entryPointId}
                </button>
                <span className="meta"> {item.steps.length} steps</span>
              </li>
            ))}
          </ul>
        </nav>
        <aside className="panel graph-details" aria-live="polite">
          {flow === null ? (
            <p className="empty">Select a flow to trace it.</p>
          ) : (
            <>
              <h2>{flow.entryPointId}</h2>
              <p className="meta">
                {flow.evidence} - {flow.confidence}
              </p>
              <ol>
                {flow.steps.map((step, index) => (
                  <li key={`${step.nodeId}:${index}`}>
                    <code>{step.nodeId}</code>
                    <span className="meta">
                      {" "}
                      {step.filePath}:{step.line} - {step.kind}
                    </span>
                  </li>
                ))}
              </ol>
              <section>
                <h3>Sources</h3>
                <AccessList values={flow.sources} />
              </section>
              <section>
                <h3>Sinks</h3>
                <AccessList values={flow.sinks} />
              </section>
              {flow.unknowns.length > 0 && (
                <section>
                  <h3>Unknowns</h3>
                  <ul>
                    {flow.unknowns.map((value) => (
                      <li key={value}>{value}</li>
                    ))}
                  </ul>
                </section>
              )}
              {flow.limitsReached.length > 0 && (
                <p className="notice-warn">Limits reached: {flow.limitsReached.join(", ")}</p>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  )
}

function AccessList({
  values,
}: {
  values: Array<{ channel: string; source: string; line: number }>
}) {
  if (values.length === 0) return <p className="empty">None observed.</p>

  return (
    <ul className="plain-list">
      {values.map((value, index) => (
        <li key={`${value.channel}:${value.line}:${index}`}>
          <strong>{value.channel}</strong> {value.source}
        </li>
      ))}
    </ul>
  )
}

function missing(value: string) {
  return { code: "FLOWS-NOT-FOUND", message: `${value} unavailable` }
}
