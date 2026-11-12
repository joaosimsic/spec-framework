import type { ApiFailure } from "../api"
import { describeFailure } from "../api"

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="panel panel-muted" role="status">
      {label}
    </div>
  )
}

export function FailurePanel({
  failure,
  onRetry,
  actionLabel = "Retry",
}: {
  failure: ApiFailure | null
  onRetry?: () => void
  actionLabel?: string
}) {
  return (
    <div className="panel notice-warn" role="alert">
      <p>{describeFailure(failure)}</p>
      {onRetry !== undefined && (
        <button type="button" onClick={onRetry}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function EmptyPanel({ children }: { children: string }) {
  return <p className="empty">{children}</p>
}
