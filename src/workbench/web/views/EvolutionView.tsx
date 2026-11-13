import { useCallback } from "react"
import { fail, ok } from "../../../core/result"
import { compareSnapshots, getCurrentProject, getProjectSnapshots } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchSnapshotComparison, WorkbenchSnapshotSummary } from "../../types"
import type { WorkbenchViewProps } from "./types"

interface EvolutionData {
  snapshots: WorkbenchSnapshotSummary[]
  comparison: WorkbenchSnapshotComparison | null
}

export function EvolutionView(_props: WorkbenchViewProps) {
  const load = useCallback(async () => {
    const [project, projectError] = await getCurrentProject()
    if (projectError !== null || project === null) return fail(projectError ?? missing("project"))
    const [snapshots, snapshotsError] = await getProjectSnapshots(project.id)
    if (snapshotsError !== null || snapshots === null) {
      return fail(snapshotsError ?? missing("snapshots"))
    }
    if (snapshots.length < 2) return ok({ snapshots, comparison: null })
    const to = snapshots[0]
    const from = snapshots[1]
    if (to === undefined || from === undefined) return ok({ snapshots, comparison: null })
    const [comparison, comparisonError] = await compareSnapshots(project.id, from.id, to.id)
    if (comparisonError !== null || comparison === null) {
      return fail(comparisonError ?? missing("comparison"))
    }

    return ok({ snapshots, comparison })
  }, [])
  const evolution = useApiResource<EvolutionData>(load)

  if (evolution.loading) return <LoadingPanel label="Loading snapshot history." />
  if (evolution.failure !== null) {
    return <FailurePanel failure={evolution.failure} onRetry={() => void evolution.reload()} />
  }
  if (evolution.data === null) return <EmptyPanel>No snapshot history is available.</EmptyPanel>
  if (evolution.data.comparison === null) {
    return (
      <EmptyPanel>
        Two snapshots are required before architecture evolution can be compared.
      </EmptyPanel>
    )
  }
  const comparison = evolution.data.comparison

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Evolution</p>
        <h2>Architecture change between snapshots</h2>
        <p className="meta">
          {comparison.from.slice(0, 13)} to {comparison.to.slice(0, 13)}
        </p>
      </section>
      <div className="panel-grid">
        <ComparisonCard title="Elements" values={comparison.elements} />
        <ComparisonCard title="Relationships" values={comparison.relationships} />
        <ComparisonCard title="Flows" values={comparison.flows} />
        <ComparisonCard title="Findings" values={comparison.findings} />
        <ComparisonCard title="Entry points" values={comparison.entryPoints} />
        <ComparisonCard title="Coverage" values={comparison.coverage} />
      </div>
    </>
  )
}

function ComparisonCard({ title, values }: { title: string; values: Record<string, string[]> }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <dl>
        {Object.entries(values).map(([key, items]) => (
          <div key={key}>
            <dt>
              {key} ({items.length})
            </dt>
            <dd>
              <ul className="plain-list">
                {items.slice(0, 20).map((item) => (
                  <li key={item} className="technical-value">
                    {item}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function missing(value: string) {
  return { code: "EVOLUTION-NOT-FOUND", message: `${value} unavailable` }
}
