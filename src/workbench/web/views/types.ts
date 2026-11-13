import type { WorkbenchSession } from "../../types"

export interface WorkbenchViewProps {
  session: WorkbenchSession
  onStatus(message: string): void
  onError(message: string): void
}
