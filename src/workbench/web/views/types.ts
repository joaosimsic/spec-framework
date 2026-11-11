import type { WorkbenchGraphView, WorkbenchSession } from "../../types"

export interface WorkbenchViewProps {
  graph: WorkbenchGraphView
  session: WorkbenchSession
  onStatus(message: string): void
  onError(message: string): void
  onRefresh(): Promise<void>
}
