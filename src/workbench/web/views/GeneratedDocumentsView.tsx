import { useCallback } from "react"
import { fail, ok } from "../../../core/result"
import { getCurrentProject, getGeneratedSection } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchViewProps } from "./types"

export function GeneratedDocumentsView(_props: WorkbenchViewProps) {
  const load = useCallback(async () => {
    const [project, projectError] = await getCurrentProject()
    if (projectError !== null || project === null) return fail(projectError ?? missing("project"))
    const [section, sectionError] = await getGeneratedSection(project.id, "architecture")
    if (sectionError !== null || section === null)
      return fail(sectionError ?? missing("architecture"))

    return ok(section)
  }, [])
  const document = useApiResource<unknown>(load)

  if (document.loading) return <LoadingPanel label="Loading generated documents." />
  if (document.failure !== null) {
    return <FailurePanel failure={document.failure} onRetry={() => void document.reload()} />
  }
  if (document.data === null) return <EmptyPanel>No generated document is available.</EmptyPanel>

  return (
    <>
      <section className="view-heading">
        <p className="eyebrow">Generated documents</p>
        <h2>Generated spec sections</h2>
        <p className="meta">Read-only output. Regenerate with `spec analyze`.</p>
      </section>
      <section className="panel">
        <pre className="technical-value">{JSON.stringify(document.data, null, 2)}</pre>
      </section>
    </>
  )
}

function missing(value: string) {
  return { code: "DOCUMENT-NOT-FOUND", message: `${value} unavailable` }
}
