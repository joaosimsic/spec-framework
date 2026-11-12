import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "../../src/core/result"
import { WorkbenchServer } from "../../src/workbench/server"
import type { CommandResult } from "./support"

const INTERNAL_ID = /\b(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS)-[A-Z0-9]+/
const PILOT_REQUIREMENT = "REQ-CHECK-001"
const PILOT_EVIDENCE = "EVD-QUINT-CHECK-EVERYINVALIDRECORDREPORTED"

export interface BundleSummary {
  directory: string
  evidence: string
  requirement: string
}

interface GraphSnapshot {
  elements: Array<{ id: string; status?: string }>
  evidence: Array<{ id: string; result?: string }>
}

interface RefactorReport {
  impact: {
    approvals_to_renew: string[]
  }
}

interface CheckReport {
  diagnostics: Array<{ code: string }>
}

export class MvpVerification {
  static async bundle(target: string): Promise<Result<BundleSummary, string>> {
    const [entries, entriesError] = await attemptAsync(() =>
      readdir(join(target, "spec", "audit"), { withFileTypes: true }),
    )
    if (entriesError !== null || entries === null) {
      return [null, entriesError ?? "no audit directory"]
    }
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    const name = directories.at(-1)
    if (name === undefined) return [null, "no audit bundle was generated"]

    const directory = join(target, "spec", "audit", name)
    const required = [
      "index.html",
      "spec.pdf",
      "manifest.json",
      "graph.json",
      "spec.lock",
      "change-report.md",
    ]
    for (const file of required) {
      const [exists, existsError] = await attemptAsync(() =>
        Bun.file(join(directory, file)).exists(),
      )
      if (existsError !== null || exists !== true) return [null, `bundle is missing ${file}`]
    }

    const [graph, graphError] = await this.json<GraphSnapshot>(join(directory, "graph.json"))
    if (graphError !== null || graph === null) return [null, graphError ?? "graph is unavailable"]
    const requirement = graph.elements.find((element) => element.id === PILOT_REQUIREMENT)
    const evidence = graph.evidence.find((record) => record.id === PILOT_EVIDENCE)
    if (requirement?.status !== "approved") {
      return [null, `${PILOT_REQUIREMENT} is not approved in the bundle`]
    }
    if (evidence?.result !== "pass") {
      return [null, `${PILOT_EVIDENCE} is not passing in the bundle`]
    }

    const [lock, lockError] = await this.json<{ elements: Record<string, unknown> }>(
      join(directory, "spec.lock"),
    )
    if (lockError !== null || lock === null) return [null, lockError ?? "lock is unavailable"]
    if (!(PILOT_REQUIREMENT in lock.elements)) {
      return [null, `${PILOT_REQUIREMENT} is not locked`]
    }

    return [{ directory, evidence: PILOT_EVIDENCE, requirement: PILOT_REQUIREMENT }, null]
  }

  static query(output: string): Result<true, string> {
    if (INTERNAL_ID.test(output)) return [null, "default query output leaked an internal ID"]
    if (!output.includes("Structural error reporting")) {
      return [null, "default query output does not name the pilot requirement"]
    }

    return [true, null]
  }

  static refactor(output: string): Result<true, string> {
    const [report, parseError] = attempt(() => JSON.parse(output) as RefactorReport)
    if (parseError !== null || report === null) return [null, "refactor report is not valid JSON"]
    if (!report.impact.approvals_to_renew.includes(PILOT_REQUIREMENT)) {
      return [null, `refactor report does not renew ${PILOT_REQUIREMENT}`]
    }

    return [true, null]
  }

  static staleCheck(result: CommandResult): Result<true, string> {
    if (result.code === 0) return [null, "check did not fail after approved content changed"]

    const [report, parseError] = attempt(() => JSON.parse(result.stdout) as CheckReport)
    if (parseError !== null || report === null) return [null, "check report is not valid JSON"]
    if (!report.diagnostics.some((diagnostic) => diagnostic.code.startsWith("APPROVAL-"))) {
      return [null, "check did not report an approval invalidation"]
    }

    return [true, null]
  }

  static async workbench(target: string): Promise<Result<true, string>> {
    const server = new WorkbenchServer({
      target,
      port: 0,
      logger: { log: () => undefined },
    })
    const [handle, startError] = await server.start()
    if (startError !== null || handle === null) {
      return [null, startError ?? "workbench did not start"]
    }

    const [responses, responseError] = await attemptAsync(async () => {
      const session = await fetch(`${handle.url}/api/session`)
      const graph = await fetch(`${handle.url}/api/graph`)

      return [session, graph] as const
    })
    handle.close()
    if (responseError !== null || responses === null) {
      return [null, responseError ?? "workbench requests failed"]
    }
    if (responses[0].status !== 200 || responses[1].status !== 200) {
      return [null, "workbench session or graph request failed"]
    }

    return [true, null]
  }

  private static async json<Value>(path: string): Promise<Result<Value, string>> {
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) return [null, readError ?? `cannot read ${path}`]

    return attempt(() => JSON.parse(text) as Value)
  }
}
