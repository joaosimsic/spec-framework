import { useCallback, useState } from "react"
import { fail, ok } from "../../../core/result"
import { getCurrentProject, getProjectVerification } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchVerification } from "../../types"
import type { WorkbenchViewProps } from "./types"

export function VerificationView(_props: WorkbenchViewProps) {
  const load = useCallback(async () => {
    const [project, projectError] = await getCurrentProject()
    if (projectError !== null || project === null) return fail(projectError ?? missing("project"))
    const [verification, verificationError] = await getProjectVerification(project.id)
    if (verificationError !== null || verification === null)
      return fail(verificationError ?? missing("verification"))

    return ok(verification)
  }, [])
  const verification = useApiResource<WorkbenchVerification>(load)
  const [selected, setSelected] = useState<string | null>(null)
  const result =
    verification.data?.results.find((candidate) => candidate.checkId === selected) ?? null

  if (verification.loading) return <LoadingPanel label="Loading verification run." />
  if (verification.failure !== null)
    return (
      <FailurePanel failure={verification.failure} onRetry={() => void verification.reload()} />
    )
  if (verification.data === null || verification.data.run === null) {
    return <EmptyPanel>No verification run is available. Run `spec check`.</EmptyPanel>
  }
  const run = verification.data.run

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Verification</p>
        <h2>Configured check results</h2>
        <p className="meta">
          {run.result} - {run.passedCount} passed, {run.failedCount} failed, {run.checkCount} total
          checks. Recorded {run.createdAt}.
        </p>
      </section>
      <div className="graph-layout graph-layout-inspector-hidden">
        <nav className="panel system-hierarchy" aria-label="Verification checks">
          <h2>Checks</h2>
          {verification.data.results.length === 0 ? (
            <p className="empty">No configured checks ran.</p>
          ) : (
            <ul className="plain-list">
              {verification.data.results.map((item) => (
                <li key={item.checkId}>
                  <button
                    type="button"
                    aria-current={selected === item.checkId ? "true" : undefined}
                    onClick={() => setSelected(item.checkId)}
                  >
                    {item.checkId}
                  </button>
                  <span className="meta">
                    {" "}
                    {item.result} - {item.durationMs}ms
                  </span>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <aside className="panel graph-details" aria-live="polite">
          {result === null ? (
            <>
              <h2>Run summary</h2>
              <p className="meta">
                {run.errors} consistency errors, {run.warnings} warnings.
              </p>
              <p className="meta">Runner {run.runnerVersion}</p>
              {run.findings.length === 0 ? (
                <p className="empty">No consistency findings.</p>
              ) : (
                <ul>
                  {run.findings.map((finding, index) => (
                    <li key={`${finding}:${index}`}>{finding}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h2>{result.checkId}</h2>
              <p className="meta">
                {result.result} - {result.confidence} - {result.durationMs}ms
              </p>
              <dl className="technical-grid">
                <dt>Command</dt>
                <dd>
                  <code>{result.command.join(" ")}</code>
                </dd>
                <dt>Working directory</dt>
                <dd>
                  <code>{result.workingDirectory}</code>
                </dd>
                <dt>Exit code</dt>
                <dd>{result.exitCode === null ? "none" : result.exitCode}</dd>
                <dt>Timed out</dt>
                <dd>{result.timedOut ? "yes" : "no"}</dd>
                <dt>Output hash</dt>
                <dd>
                  <code>{result.outputHash}</code>
                </dd>
                <dt>Input hashes</dt>
                <dd>
                  {result.inputHashes.map((hash) => (
                    <code key={hash}>{hash.slice(0, 16)} </code>
                  ))}
                </dd>
              </dl>
              {result.output === "" ? (
                <p className="empty">No output.</p>
              ) : (
                <pre>{result.output}</pre>
              )}
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
  return { code: "VERIFICATION-NOT-FOUND", message: `${value} unavailable` }
}
