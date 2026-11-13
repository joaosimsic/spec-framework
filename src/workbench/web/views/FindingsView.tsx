import { useCallback, useState } from "react"
import { fail, ok } from "../../../core/result"
import { getCurrentProject, getProjectFindings, patchFinding } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchFinding } from "../../types"
import type { WorkbenchViewProps } from "./types"

export function FindingsView({ onStatus, onError }: WorkbenchViewProps) {
  const load = useCallback(async () => {
    const [project, projectError] = await getCurrentProject()
    if (projectError !== null || project === null) return fail(projectError ?? missing("project"))
    const [findings, findingsError] = await getProjectFindings(project.id)
    if (findingsError !== null || findings === null)
      return fail(findingsError ?? missing("findings"))

    return ok(findings)
  }, [])
  const findings = useApiResource<WorkbenchFinding[]>(load)
  const [selected, setSelected] = useState<string | null>(null)
  const finding = findings.data?.find((candidate) => candidate.id === selected) ?? null

  async function decide(status: string): Promise<void> {
    if (finding === null) return
    const [updated, updateError] = await patchFinding(finding.id, status, "")
    if (updateError !== null || updated === null) {
      onError(updateError?.message ?? "finding was not updated")
      return
    }
    findings.setData((findings.data ?? []).map((item) => (item.id === updated.id ? updated : item)))
    onStatus(`Finding marked ${status}.`)
  }

  if (findings.loading) return <LoadingPanel label="Loading architecture findings." />
  if (findings.failure !== null)
    return <FailurePanel failure={findings.failure} onRetry={() => void findings.reload()} />
  if (findings.data === null || findings.data.length === 0) {
    return <EmptyPanel>No findings were produced for the latest snapshot.</EmptyPanel>
  }
  const deterministic = findings.data.filter((item) => item.family === "deterministic")
  const assisted = findings.data.filter((item) => item.family === "ai_assisted")

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Findings</p>
        <h2>Architecture diagnostics</h2>
        <p className="meta">
          {deterministic.length} deterministic - {assisted.length} AI-assisted
        </p>
      </section>
      <div className="graph-layout graph-layout-inspector-hidden">
        <nav className="panel system-hierarchy" aria-label="Findings">
          <h2>Deterministic</h2>
          <FindingList findings={deterministic} selected={selected} onSelect={setSelected} />
          <h2>AI-assisted</h2>
          <FindingList findings={assisted} selected={selected} onSelect={setSelected} />
        </nav>
        <aside className="panel graph-details" aria-live="polite">
          {finding === null ? (
            <p className="empty">Select a finding to inspect its evidence.</p>
          ) : (
            <>
              <h2>{finding.title}</h2>
              <p className="meta">
                {finding.ruleId} - {finding.family} - {finding.status}
              </p>
              <p>{finding.explanation}</p>
              <p>{finding.recommendation}</p>
              <ul className="plain-list">
                {finding.evidence.map((item, index) => (
                  <li key={`${item.reference}:${index}`}>
                    <strong>{item.kind}</strong> {item.reference}{" "}
                    <span className="meta">
                      {item.file}:{item.line}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="graph-control-group">
                <button type="button" onClick={() => void decide("confirmed")}>
                  Confirm
                </button>
                <button type="button" onClick={() => void decide("rejected")}>
                  Reject
                </button>
                <button type="button" onClick={() => void decide("needs_investigation")}>
                  Needs investigation
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  )
}

function FindingList({
  findings,
  selected,
  onSelect,
}: {
  findings: WorkbenchFinding[]
  selected: string | null
  onSelect(id: string): void
}) {
  if (findings.length === 0) return <p className="empty">None.</p>

  return (
    <ul className="plain-list">
      {findings.map((finding) => (
        <li key={finding.id}>
          <button
            type="button"
            aria-current={selected === finding.id ? "true" : undefined}
            onClick={() => onSelect(finding.id)}
          >
            {finding.title}
          </button>
          <span className="meta">
            {" "}
            {finding.ruleId} - {finding.status}
          </span>
        </li>
      ))}
    </ul>
  )
}

function missing(value: string) {
  return { code: "FINDINGS-NOT-FOUND", message: `${value} unavailable` }
}
