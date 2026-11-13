import { fail, ok, type Result } from "../core/result"
import type { WorkbenchService } from "../workbench/service"
import type { WorkbenchContextView } from "../workbench/types"

export interface TerminalNextView {
  mode: "read-only" | "scratch" | "mapping" | "refactor"
  context: WorkbenchContextView
}

export class TerminalNextReporter {
  constructor(private readonly service: WorkbenchService) {}

  async read(): Promise<Result<TerminalNextView, string>> {
    const [context, error] = await this.service.context([])
    if (error !== null) return fail(error.message)
    if (context === null) return fail("context unavailable")

    return ok({
      mode: context.proposal?.mode ?? "read-only",
      context,
    })
  }
}
