import { join } from "node:path"
import { fail, ok, type Result } from "../src/core/result"
import { MvpFailure, MvpRunner, MvpWorkspace, type CommandResult } from "./mvp/support"
import { MvpVerification, type GraphSummary } from "./mvp/verify"

const REPO_ROOT = join(import.meta.dir, "..")
const PILOT_SCOPE = "Structural error reporting"
const REVISED_SCOPE = "Structural error reporting revised"
const REFACTOR_OPERATION = JSON.stringify({
  kind: "rename",
  target: "REQ-CHECK-001",
  title: REVISED_SCOPE,
})

interface MvpSummary {
  workspace: string
  bundle: string
  approvalInvalidation: string
  graph: GraphSummary
  draftGraph: string
  elapsedMs: number
}

export async function runMvp(repoRoot: string): Promise<Result<MvpSummary, string>> {
  const startedAt = Date.now()
  progress("prepare workspace")
  const [workspace, workspaceError] = await MvpWorkspace.create(repoRoot)
  if (workspaceError !== null || workspace === null) {
    return fail(workspaceError ?? "cannot create MVP workspace")
  }

  const runner = new MvpRunner(repoRoot, workspace)
  progress("initialize git")
  const [initialized, initError] = await runner.initializeGit()
  if (initError !== null) return fail(`${initError}\nworkspace: ${workspace.target}`)
  if (initialized === null || initialized.code !== 0) {
    return fail(
      `${MvpFailure.missing("git init", initialized as CommandResult)}\nworkspace: ${workspace.target}`,
    )
  }

  const [doctor, doctorError] = await thisStep(runner, "doctor", ["doctor"])
  if (doctorError !== null) return fail(`${doctorError}\nworkspace: ${workspace.target}`)
  const [checked, checkError] = await thisStep(runner, "check", ["check"])
  if (checkError !== null) return fail(`${checkError}\nworkspace: ${workspace.target}`)

  const [approved, approvalError] = await thisStep(
    runner,
    "approve",
    [
      "approve",
      "--scope",
      PILOT_SCOPE,
      "--scope",
      "spec CLI package",
      "--scope",
      "opencode plugin",
      "--scope",
      "spec-framework",
      "--approver",
      "spec-mvp",
    ],
    { input: "y\n" },
  )
  if (approvalError !== null) return fail(`${approvalError}\nworkspace: ${workspace.target}`)
  void approved
  void checked
  void doctor

  progress("commit approved slice")
  const [commit, commitError] = await commitApproval(runner)
  if (commitError !== null) return fail(`${commitError}\nworkspace: ${workspace.target}`)
  void commit

  const [bundleRun, bundleError] = await thisStep(runner, "bundle", ["bundle"])
  if (bundleError !== null) return fail(`${bundleError}\nworkspace: ${workspace.target}`)
  void bundleRun

  progress("verify bundle")
  const [bundle, bundleVerifyError] = await MvpVerification.bundle(workspace.target)
  if (bundleVerifyError !== null || bundle === null) {
    return fail(
      `${bundleVerifyError ?? "bundle verification failed"}\nworkspace: ${workspace.target}`,
    )
  }

  const [query, queryError] = await thisStep(runner, "query", ["query", "--view", "experience"])
  if (queryError !== null) return fail(`${queryError}\nworkspace: ${workspace.target}`)
  progress("verify query output")
  const [, queryVerifyError] = MvpVerification.query(query?.stdout ?? "")
  if (queryVerifyError !== null) {
    return fail(`${queryVerifyError}\nworkspace: ${workspace.target}`)
  }

  progress("smoke workbench")
  const [workbench, workbenchError] = await MvpVerification.workbench(workspace.target)
  if (workbenchError !== null) return fail(`${workbenchError}\nworkspace: ${workspace.target}`)
  void workbench

  const [refactor, refactorError] = await thisStep(runner, "refactor", [
    "refactor",
    "Update structural error reporting",
    "--op",
    REFACTOR_OPERATION,
    "--simulate",
    "--json",
  ])
  if (refactorError !== null) return fail(`${refactorError}\nworkspace: ${workspace.target}`)
  progress("verify refactor report")
  const [, refactorVerifyError] = MvpVerification.refactor(refactor?.stdout ?? "")
  if (refactorVerifyError !== null) {
    return fail(`${refactorVerifyError}\nworkspace: ${workspace.target}`)
  }

  progress("verify stale approval")
  const [staleCheck, staleError] = await thisStep(runner, "stale check", ["check", "--json"], {
    allowFailure: true,
  })
  if (staleError !== null) return fail(`${staleError}\nworkspace: ${workspace.target}`)
  if (staleCheck === null)
    return fail(`stale check produced no result\nworkspace: ${workspace.target}`)
  const [, staleVerifyError] = MvpVerification.staleCheck(staleCheck)
  if (staleVerifyError !== null) {
    return fail(`${staleVerifyError}\nworkspace: ${workspace.target}`)
  }

  progress("commit revised slice")
  const [, proposalCommitError] = await commitChanges(runner, "update mvp slice")
  if (proposalCommitError !== null) {
    return fail(`${proposalCommitError}\nworkspace: ${workspace.target}`)
  }

  const [reapproved, reapprovalError] = await thisStep(
    runner,
    "reapprove",
    ["approve", "--scope", REVISED_SCOPE, "--approver", "spec-mvp"],
    { input: "y\n" },
  )
  if (reapprovalError !== null) return fail(`${reapprovalError}\nworkspace: ${workspace.target}`)
  void reapproved

  const [finalCheck, finalCheckError] = await thisStep(runner, "final check", ["check"])
  if (finalCheckError !== null) return fail(`${finalCheckError}\nworkspace: ${workspace.target}`)
  void finalCheck

  const [mapReport, mapError] = await thisStep(runner, "repo graph", ["map", "--json"])
  if (mapError !== null) return fail(`${mapError}\nworkspace: ${workspace.target}`)
  progress("verify repo graph")
  const [graph, graphVerifyError] = MvpVerification.graph(mapReport?.stdout ?? "")
  if (graphVerifyError !== null || graph === null) {
    return fail(
      `${graphVerifyError ?? "graph verification failed"}\nworkspace: ${workspace.target}`,
    )
  }

  const [draftRun, draftError] = await thisStep(runner, "draft graph", ["map", "--draft"])
  if (draftError !== null) return fail(`${draftError}\nworkspace: ${workspace.target}`)
  void draftRun
  progress("verify draft graph")
  const [draftGraph, draftVerifyError] = await MvpVerification.draft(workspace.target)
  if (draftVerifyError !== null || draftGraph === null) {
    return fail(
      `${draftVerifyError ?? "draft graph verification failed"}\nworkspace: ${workspace.target}`,
    )
  }

  progress("validate draft graph")
  const [draftDirectory, draftDirectoryError] = await MvpVerification.isolatedDraft(
    workspace.target,
    workspace.root,
  )
  if (draftDirectoryError !== null || draftDirectory === null) {
    return fail(
      `${draftDirectoryError ?? "cannot isolate draft graph"}\nworkspace: ${workspace.target}`,
    )
  }
  const [like4, like4Error] = await runner.tool("likec4", ["validate", "--json", draftDirectory])
  if (like4Error !== null || like4 === null) {
    return fail(`${like4Error ?? "likec4 validation failed"}\nworkspace: ${workspace.target}`)
  }
  if (like4.code !== 0) {
    return fail(`${MvpFailure.command("likec4 validate", like4)}\nworkspace: ${workspace.target}`)
  }
  const [, like4VerifyError] = MvpVerification.like4Validation(like4.stdout)
  if (like4VerifyError !== null) {
    return fail(`${like4VerifyError}\nworkspace: ${workspace.target}`)
  }

  return ok({
    workspace: workspace.target,
    bundle: bundle.directory,
    approvalInvalidation: `${PILOT_SCOPE} -> ${REVISED_SCOPE}`,
    graph,
    draftGraph,
    elapsedMs: Date.now() - startedAt,
  })
}

async function thisStep(
  runner: MvpRunner,
  label: string,
  argumentsList: string[],
  options: { input?: string; allowFailure?: boolean } = {},
): Promise<Result<CommandResult, string>> {
  progress(`${label} (${argumentsList.join(" ")})`)
  const startedAt = Date.now()
  const heartbeat = setInterval(() => {
    progress(`${label} still running (${seconds(Date.now() - startedAt)}s)`)
  }, 10_000)
  const [result, error] = await runner.spec(argumentsList, options)
  clearInterval(heartbeat)
  if (error !== null) return fail(error)
  if (result === null) return fail(`${label} produced no result`)
  if (result.code !== 0 && options.allowFailure !== true) {
    return fail(MvpFailure.command(label, result))
  }
  progress(
    `${label} ${result.code === 0 ? "ok" : `exit ${result.code}`} (${seconds(Date.now() - startedAt)}s)`,
  )

  return ok(result)
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}

function progress(message: string): void {
  console.log(`mvp: ${message}`)
}

async function commitApproval(runner: MvpRunner): Promise<Result<CommandResult, string>> {
  return commitChanges(runner, "approve mvp slice")
}

async function commitChanges(
  runner: MvpRunner,
  message: string,
): Promise<Result<CommandResult, string>> {
  const [added, addError] = await runner.git(["add", "spec"])
  if (addError !== null || added === null || added.code !== 0) {
    return fail(addError ?? MvpFailure.command("git add", added as CommandResult))
  }

  return runner.git(["commit", "-m", message])
}

const [summary, error] = await runMvp(REPO_ROOT)
if (error !== null || summary === null) {
  console.error(`mvp failed: ${error ?? "no summary"}`)
  process.exit(1)
}

console.log("mvp: pass")
console.log(`mvp: workspace ${summary.workspace}`)
console.log(`mvp: bundle ${summary.bundle}`)
console.log(`mvp: approval invalidation ${summary.approvalInvalidation}`)
console.log(
  `mvp: graph ${summary.graph.elements} elements, ${summary.graph.relations} relations, ${summary.graph.components} components, ${summary.graph.files} files`,
)
console.log(`mvp: draft graph ${summary.draftGraph}`)
console.log(`mvp: elapsed ${seconds(summary.elapsedMs)}s`)
