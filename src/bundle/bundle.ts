import { isAbsolute, join, resolve } from "node:path"
import pkg from "../../package.json"
import { SpecLockLoader, specLockPath } from "../approval/lock"
import type { SpecLock } from "../approval/types"
import { ProposalImpactAnalyzer } from "../change/impact"
import { runCheck } from "../core/check"
import { SpecConfigLoader } from "../core/config"
import { attemptAsync, type Result } from "../core/result"
import { loadRequirementSources } from "../core/requirements"
import type { Diagnostic } from "../core/types"
import type { EvidenceRecord } from "../evidence"
import type { GraphWorkspace, SpecGraph } from "../model/types"
import { collectWorkspaceContributions, SpecGraphBuilder } from "../model"
import { GitWorkspaceReader } from "../query/git"
import type { WorkspaceMetadataReader } from "../query/types"
import { BundleChangeReportRenderer } from "./change-report"
import { BundleEvidenceWriter } from "./evidence"
import { BundleHasher } from "./hash"
import { BundleHtmlRenderer } from "./html"
import { BundleManifestBuilder } from "./manifest"
import { BundlePdfRenderer } from "./pdf"
import { BranchProposalReader } from "./proposal"
import { BundleReportBuilder } from "./report"
import { BundleSourceCollector } from "./sources"
import type {
  BundleManifest,
  BundleOptions,
  BundleReport,
  BundleRun,
  BundleSource,
  ProposalContextReader,
} from "./types"
import { BundleWriter, type BundleOutputFile } from "./writer"

export async function runBundle(target: string, options: BundleOptions = {}): Promise<BundleRun> {
  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError !== null) return failure(configError.message)
  if (config === null) return failure("config loader returned no configuration")

  const workspaceReader =
    options.workspaceReader ??
    new GitWorkspaceReader(options.checkOptions?.processRunner, options.checkOptions?.toolLocator)
  const [workspace, workspaceError] = await workspaceReader.read(target)
  if (workspaceError !== null) return failure(`cannot read workspace: ${workspaceError}`)
  if (workspace === null) return failure("workspace reader returned no metadata")
  if (workspace.dirty && options.allowDirty !== true) {
    return failure("git tree is dirty; commit the model or pass --allow-dirty")
  }

  const check = await runCheck(target, {
    ...options.checkOptions,
    json: false,
  })
  if (check.result.errors > 0) {
    return failure(`checks reported ${check.result.errors} error(s)\n${check.output}`)
  }

  const [lock, lockError] = await loadLock(target)
  if (lockError !== null) return failure(lockError)

  const [sources, sourceError] = await new BundleSourceCollector().collect(target)
  if (sourceError !== null || sources === null) {
    return failure(sourceError ?? "cannot collect bundle sources")
  }

  const [graph, graphError] = await buildGraph(
    target,
    workspace,
    check.evidence,
    check.result.diagnostics,
  )
  if (graphError !== null || graph === null) return failure(graphError ?? "cannot build graph")

  const [changeReport, changeError] = await buildChangeReport(
    target,
    workspace.commit,
    lock,
    options,
  )
  if (changeError !== null || changeReport === null) {
    return failure(changeError ?? "cannot build change report")
  }

  const preview = workspace.dirty
  const report = new BundleReportBuilder().build({
    project: config.project.name,
    specVersion: pkg.version,
    graph,
    evidence: check.evidence,
    checks: check.result,
    sources,
    lock,
    changeReport,
    preview,
  })

  const directory = bundleDirectory(target, workspace.commit, options.output)
  const files = await outputFiles(target, report, graph, lock, sources, check.evidence)
  if (files === null) return failure("cannot render bundle files")

  const manifest = await new BundleManifestBuilder().build({
    target,
    project: config.project,
    specVersion: pkg.version,
    report,
    files: fileHashes(files),
  })
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  const [written, writeError] = await new BundleWriter().write(
    directory,
    [...files, { path: "manifest.json", content: manifestContent }],
    options.force === true,
  )
  if (writeError !== null || written === null) {
    return failure(writeError ?? "cannot write bundle")
  }

  return success(directory, manifest, report, options.json === true)
}

async function loadLock(target: string): Promise<Result<SpecLock | null, string>> {
  const [lock, lockError] = await new SpecLockLoader(target).load()
  if (lockError === null) return [lock, null]
  if (lockError.code === "SPEC-LOCK-NOT-FOUND") return [null, null]

  return [null, lockError.message]
}

async function buildGraph(
  target: string,
  workspace: GraphWorkspace,
  evidence: EvidenceRecord[],
  diagnostics: Diagnostic[],
): Promise<Result<SpecGraph, string>> {
  const sources = await loadRequirementSources(target)
  const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
  if (sourceErrors.length > 0) return [null, sourceErrors.map((item) => item.message).join("\n")]

  const builder = new SpecGraphBuilder()
  for (const contribution of await collectWorkspaceContributions(target, sources.blocks)) {
    builder.add(contribution)
  }
  builder.add({
    elements: [],
    evidence: evidence.map((record) => ({
      id: record.id,
      kind: record.kind,
      method: record.method,
      result: record.result,
      hash: record.hash,
    })),
    findings: diagnostics.map((item) => ({
      level: item.level,
      code: item.code,
      message: item.message,
      ...(item.id === undefined ? {} : { id: item.id }),
    })),
  })

  const [graph, graphError] = builder.build(workspace, { spec: pkg.version })
  if (graphError !== null) return [null, `${graphError.code}: ${graphError.message}`]
  if (graph === null) return [null, "graph builder returned no graph"]

  return [graph, null]
}

async function buildChangeReport(
  target: string,
  commit: string,
  lock: SpecLock | null,
  options: BundleOptions,
): Promise<Result<string, string>> {
  const reader: ProposalContextReader =
    options.proposalReader ??
    new BranchProposalReader(options.checkOptions?.processRunner, options.checkOptions?.toolLocator)
  const [context, contextError] = await reader.read(target)
  if (contextError !== null) return [null, contextError]
  if (context === null) return [new BundleChangeReportRenderer().empty(commit), null]

  const [impact, impactError] = await new ProposalImpactAnalyzer(target).analyze(
    context.proposal,
    context.proposal.operations,
    lock,
  )
  if (impactError !== null) return [null, impactError]
  if (impact === null) return [null, "impact analysis returned no result"]

  return [
    new BundleChangeReportRenderer().render(
      context.proposal,
      context.proposal.operations,
      impact.impact,
    ),
    null,
  ]
}

async function outputFiles(
  target: string,
  report: BundleReport,
  graph: SpecGraph,
  lock: SpecLock | null,
  sources: BundleSource[],
  evidence: EvidenceRecord[],
): Promise<BundleOutputFile[] | null> {
  const files: BundleOutputFile[] = [
    { path: "graph.json", content: `${JSON.stringify(graph, null, 2)}\n` },
    { path: "index.html", content: new BundleHtmlRenderer().render(report) },
    { path: "spec.pdf", content: new BundlePdfRenderer().render(report) },
    { path: "change-report.md", content: report.changeReport },
  ]

  if (lock !== null) {
    const [content, readError] = await attemptAsync(() => Bun.file(specLockPath(target)).text())
    if (readError !== null || content === null) return null
    files.push({ path: "spec.lock", content })
  }

  files.push(
    ...sources.map((source) => ({
      path: `sources/${source.path.slice("spec/".length)}`,
      content: source.content,
    })),
  )
  files.push(
    ...new BundleEvidenceWriter()
      .artifacts(evidence)
      .map((artifact) => ({ path: artifact.path, content: artifact.content })),
  )

  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function fileHashes(files: BundleOutputFile[]): Record<string, string> {
  return Object.fromEntries(
    files
      .map((file) => [file.path, BundleHasher.bytes(file.content)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function bundleDirectory(target: string, commit: string, output: string | undefined): string {
  if (output !== undefined) return isAbsolute(output) ? output : resolve(target, output)

  return join(target, "spec", "audit", `audit-${commit.slice(0, 12)}`)
}

function success(
  directory: string,
  manifest: BundleManifest,
  report: BundleReport,
  json: boolean,
): BundleRun {
  if (json) {
    return {
      directory,
      manifest,
      output: JSON.stringify({ directory, manifest }, null, 2),
      code: 0,
    }
  }

  const lines = [
    `bundle: ${directory}`,
    `commit: ${report.commit}`,
    `files: ${Object.keys(manifest.files).length + 1}`,
    `evidence: ${report.evidence.length}`,
    `approvals: ${report.approvals.length}`,
    ...(report.preview ? ["preview: dirty tree"] : []),
  ]

  return { directory, manifest, output: lines.join("\n"), code: 0 }
}

function failure(message: string): BundleRun {
  return {
    directory: null,
    manifest: null,
    output: `bundle failed: ${message}`,
    code: 1,
  }
}
