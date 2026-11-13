import { cp, mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { attempt, attemptAsync, type Result, ok, fail } from "../../src/core/result"
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

export interface GraphSummary {
  elements: number
  relations: number
  components: number
  files: number
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

interface MapElement {
  id: string
  kind: string
  title?: string
  links: Array<{ type: string; to: string }>
}

interface MapReport {
  elements: MapElement[]
  summary: { relations: number }
}

export class MvpVerification {
  static async bundle(target: string): Promise<Result<BundleSummary, string>> {
    const [entries, entriesError] = await attemptAsync(() =>
      readdir(join(target, "spec", "audit"), { withFileTypes: true }),
    )
    if (entriesError !== null || entries === null) {
      return fail(entriesError ?? "no audit directory")
    }
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    const name = directories.at(-1)
    if (name === undefined) return fail("no audit bundle was generated")

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
      if (existsError !== null || exists !== true) return fail(`bundle is missing ${file}`)
    }

    const [graph, graphError] = await this.json<GraphSnapshot>(join(directory, "graph.json"))
    if (graphError !== null || graph === null) return fail(graphError ?? "graph is unavailable")
    const requirement = graph.elements.find((element) => element.id === PILOT_REQUIREMENT)
    const evidence = graph.evidence.find((record) => record.id === PILOT_EVIDENCE)
    if (requirement?.status !== "approved") {
      return fail(`${PILOT_REQUIREMENT} is not approved in the bundle`)
    }
    if (evidence?.result !== "pass") {
      return fail(`${PILOT_EVIDENCE} is not passing in the bundle`)
    }

    const [lock, lockError] = await this.json<{ elements: Record<string, unknown> }>(
      join(directory, "spec.lock"),
    )
    if (lockError !== null || lock === null) return fail(lockError ?? "lock is unavailable")
    if (!(PILOT_REQUIREMENT in lock.elements)) {
      return fail(`${PILOT_REQUIREMENT} is not locked`)
    }

    return ok({ directory, evidence: PILOT_EVIDENCE, requirement: PILOT_REQUIREMENT })
  }

  static graph(output: string): Result<GraphSummary, string> {
    const [report, parseError] = attempt(() => JSON.parse(output) as MapReport)
    if (parseError !== null || report === null) return fail("map report is not valid JSON")

    const byId = new Map(report.elements.map((element) => [element.id, element]))
    const requiredComponents = [
      "CMP-SRC-ADAPTERS",
      "CMP-SRC-APPROVAL",
      "CMP-SRC-BUNDLE",
      "CMP-SRC-CHANGE",
      "CMP-SRC-CLI",
      "CMP-SRC-CORE",
      "CMP-SRC-DISCOVERY",
      "CMP-SRC-EVIDENCE",
      "CMP-SRC-MODEL",
      "CMP-SRC-QUERY",
      "CMP-SRC-TERMINAL",
      "CMP-SRC-WORKBENCH",
      "CMP-PLUGIN-OPENCODE",
    ]
    for (const id of requiredComponents) {
      if (!byId.has(id)) return fail(`repo graph is missing subsystem ${id}`)
    }

    const requiredFiles = [
      "FILE-SRC-CHANGE-OPERATIONS-TS",
      "FILE-SRC-CORE-SDOC-TS",
      "FILE-SRC-WORKBENCH-SERVICE-TS",
      "FILE-PLUGIN-OPENCODE-SRC-TOOLS-TS",
    ]
    for (const id of requiredFiles) {
      if (!byId.has(id)) return fail(`repo graph is missing file ${id}`)
    }

    const operations = byId.get("FILE-SRC-CHANGE-OPERATIONS-TS")
    if (!this.hasLink(operations, "depends_on", "FILE-SRC-CORE-RESULT-TS")) {
      return fail("repo graph is missing the operations -> result file dependency")
    }
    if (!this.hasLink(operations, "part_of", "CMP-SRC-CHANGE")) {
      return fail("repo graph is missing the operations file containment")
    }
    const change = byId.get("CMP-SRC-CHANGE")
    if (!this.hasLink(change, "depends_on", "CMP-SRC-CORE")) {
      return fail("repo graph is missing the change -> core subsystem dependency")
    }

    const files = report.elements.filter((element) => element.kind === "module").length
    const components = report.elements.filter((element) => element.kind === "component").length
    if (files < 100) return fail(`repo graph has too few file nodes: ${files}`)
    if (components < requiredComponents.length) {
      return fail(`repo graph has too few components: ${components}`)
    }

    return ok({
      elements: report.elements.length,
      relations: report.summary.relations,
      components,
      files,
    })
  }

  static async isolatedDraft(target: string, root: string): Promise<Result<string, string>> {
    const source = join(target, "spec", "generated", "draft.gen.c4")
    const directory = join(root, "draft-check", "spec", "architecture")
    const [, error] = await attemptAsync(async () => {
      await mkdir(directory, { recursive: true })
      await cp(source, join(directory, "draft.gen.c4"))
    })
    if (error !== null) return fail(`cannot isolate draft graph: ${error}`)

    return ok(directory)
  }

  static like4Validation(output: string): Result<true, string> {
    const [report, parseError] = attempt(() => JSON.parse(output) as { valid?: unknown })
    if (parseError !== null || report === null) return fail("likec4 output is not valid JSON")
    if (report.valid !== true) return fail("likec4 rejected the draft graph")

    return ok(true)
  }

  static async draft(target: string): Promise<Result<string, string>> {
    const path = join(target, "spec", "generated", "draft.gen.c4")
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) return fail(readError ?? "draft graph is unavailable")
    for (const required of [
      "view mapDraft",
      "element module",
      "// CMP-SRC-CHANGE",
      "// FILE-SRC-CHANGE-OPERATIONS-TS",
      "'depends_on'",
    ]) {
      if (!text.includes(required)) return fail(`draft graph is missing ${required}`)
    }

    return ok(path)
  }

  static query(output: string): Result<true, string> {
    if (INTERNAL_ID.test(output)) return fail("default query output leaked an internal ID")
    if (!output.includes("Structural error reporting")) {
      return fail("default query output does not name the pilot requirement")
    }

    return ok(true)
  }

  static refactor(output: string): Result<true, string> {
    const [report, parseError] = attempt(() => JSON.parse(output) as RefactorReport)
    if (parseError !== null || report === null) return fail("refactor report is not valid JSON")
    if (!report.impact.approvals_to_renew.includes(PILOT_REQUIREMENT)) {
      return fail(`refactor report does not renew ${PILOT_REQUIREMENT}`)
    }

    return ok(true)
  }

  static staleCheck(result: CommandResult): Result<true, string> {
    if (result.code === 0) return fail("check did not fail after approved content changed")

    const [report, parseError] = attempt(() => JSON.parse(result.stdout) as CheckReport)
    if (parseError !== null || report === null) return fail("check report is not valid JSON")
    if (!report.diagnostics.some((diagnostic) => diagnostic.code.startsWith("APPROVAL-"))) {
      return fail("check did not report an approval invalidation")
    }

    return ok(true)
  }

  static async workbench(target: string): Promise<Result<true, string>> {
    const server = new WorkbenchServer({
      target,
      port: 0,
      logger: { log: () => undefined },
    })
    const [handle, startError] = await server.start()
    if (startError !== null || handle === null) {
      return fail(startError ?? "workbench did not start")
    }

    const [responses, responseError] = await attemptAsync(async () => {
      const session = await fetch(`${handle.url}/api/session`)
      const graph = await fetch(`${handle.url}/api/graph`)

      return [session, graph] as const
    })
    handle.close()
    if (responseError !== null || responses === null) {
      return fail(responseError ?? "workbench requests failed")
    }
    if (responses[0].status !== 200 || responses[1].status !== 200) {
      return fail("workbench session or graph request failed")
    }

    return ok(true)
  }

  private static hasLink(element: MapElement | undefined, type: string, to: string): boolean {
    return element?.links.some((link) => link.type === type && link.to === to) ?? false
  }

  private static async json<Value>(path: string): Promise<Result<Value, string>> {
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) return fail(readError ?? `cannot read ${path}`)

    return attempt(() => JSON.parse(text) as Value)
  }
}
