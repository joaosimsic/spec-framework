import { fail, ok, type Result } from "../core/result"
import {
  AnalysisArtifactExporter,
  AnalysisDatabase,
  AnalysisIds,
  AnalysisRunRepository,
  AnnotationRepository,
  CodeArtifactRepository,
  ElementRepository,
  EMPTY_COVERAGE,
  EntryPointRepository,
  FindingRepository,
  FlowRepository,
  GeneratedSpecRepository,
  JobRepository,
  SnapshotIdentityFactory,
  RelationshipRepository,
  SnapshotRepository,
  type AnalysisRunRecord,
  type CodeArtifactRecord,
  type JobRecord,
  type JobState,
  type ProjectRecord,
  type SnapshotRecord,
} from "../persistence"
import { SpecFrameworkConfigLoader } from "../config"
import { DiagnosticsConfigFactory } from "../diagnostics/config"
import { DiagnosticsEngine } from "../diagnostics/engine"
import { GeneratedSpecBuilder } from "../generation"
import { SystemProjectionBuilder } from "../implementation"
import { GeneratedSpecWriter } from "../spec"
import { JobEventBus } from "./events"
import type {
  AnalysisExecutionRequest,
  AnalysisExecutor,
  AnalysisProgress,
  JobEvent,
  JobEventType,
} from "./types"

interface QueuedJob {
  job: JobRecord
  project: ProjectRecord
  run: AnalysisRunRecord
  controller: AbortController
}

export interface AnalysisJobRunnerOptions {
  concurrency?: number
  now?: () => string
}

export class AnalysisJobRunner {
  private readonly jobs: JobRepository
  private readonly snapshots: SnapshotRepository
  private readonly artifacts: CodeArtifactRepository
  private readonly elements: ElementRepository
  private readonly relationships: RelationshipRepository
  private readonly entryPoints: EntryPointRepository
  private readonly findings: FindingRepository
  private readonly flows: FlowRepository
  private readonly generatedSpecs: GeneratedSpecRepository
  private readonly annotations: AnnotationRepository
  private readonly runs: AnalysisRunRepository
  private readonly now: () => string
  private readonly concurrency: number
  private readonly queue: QueuedJob[] = []
  private readonly active = new Map<string, QueuedJob>()

  constructor(
    private readonly database: AnalysisDatabase,
    private readonly executor: AnalysisExecutor,
    readonly events: JobEventBus,
    options: AnalysisJobRunnerOptions = {},
  ) {
    this.jobs = new JobRepository(database)
    this.snapshots = new SnapshotRepository(database)
    this.artifacts = new CodeArtifactRepository(database)
    this.elements = new ElementRepository(database)
    this.relationships = new RelationshipRepository(database)
    this.entryPoints = new EntryPointRepository(database)
    this.findings = new FindingRepository(database)
    this.flows = new FlowRepository(database)
    this.generatedSpecs = new GeneratedSpecRepository(database)
    this.annotations = new AnnotationRepository(database)
    this.runs = new AnalysisRunRepository(database)
    this.now = options.now ?? (() => new Date().toISOString())
    this.concurrency = Math.max(1, options.concurrency ?? 1)
  }

  start(project: ProjectRecord): Result<JobRecord, string> {
    const createdAt = this.now()
    const job: JobRecord = {
      id: AnalysisIds.job(createdAt),
      projectId: project.id,
      state: "queued",
      phase: "queued",
      progress: 0,
      message: "waiting for analysis",
      error: null,
      snapshotId: null,
      createdAt,
      startedAt: null,
      finishedAt: null,
    }
    const [saved, saveError] = this.jobs.save(job)
    if (saveError !== null || saved === null) return fail(saveError ?? "job was not created")

    const run: AnalysisRunRecord = {
      id: AnalysisIds.run(createdAt),
      projectId: project.id,
      state: "queued",
      startedAt: null,
      finishedAt: null,
      error: null,
    }
    const [, runError] = this.runs.save(run)
    if (runError !== null) return fail(runError)

    const queued: QueuedJob = { job: saved, project, run, controller: new AbortController() }
    this.queue.push(queued)
    this.emit(saved, "queued", "waiting for analysis")
    this.pump()

    return ok(saved)
  }

  get(jobId: string): JobRecord | null {
    return this.jobs.find(jobId)
  }

  list(projectId: string): JobRecord[] {
    return this.jobs.list(projectId)
  }

  cancel(jobId: string): Result<JobRecord, string> {
    const queued = this.queue.find((item) => item.job.id === jobId)
    if (queued !== undefined) {
      this.queue.splice(this.queue.indexOf(queued), 1)
      return this.complete(
        queued,
        queued.job,
        queued.run,
        "cancelled",
        "analysis cancelled",
        null,
        null,
      )
    }

    const running = this.active.get(jobId)
    if (running === undefined) return fail(`job '${jobId}' is not queued or running`)
    running.controller.abort()

    return ok(running.job)
  }

  history(jobId: string): JobEvent[] {
    return this.events.historyFor(jobId)
  }

  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void {
    return this.events.subscribe(jobId, listener)
  }

  private pump(): void {
    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const queued = this.queue.shift()
      if (queued === undefined) return
      this.active.set(queued.job.id, queued)
      void this.run(queued)
    }
  }

  private async run(queued: QueuedJob): Promise<void> {
    let current = this.transition(queued.job, "running", "starting", 0, "analysis started")
    this.emit(current, "phase_started", "analysis started")
    const request: AnalysisExecutionRequest = {
      project: queued.project,
      signal: queued.controller.signal,
      report: (progress) => {
        current = this.report(current, progress)
      },
    }
    const [result, executionError] = await this.executor.execute(request)
    if (queued.controller.signal.aborted) {
      this.complete(queued, current, queued.run, "cancelled", "analysis cancelled", null, null)
      return
    }
    if (executionError !== null || result === null) {
      this.complete(
        queued,
        current,
        queued.run,
        "failed",
        "analysis failed",
        executionError ?? "analysis failed",
        null,
      )
      return
    }

    const [snapshot, snapshotError] = await this.persist(queued.project, current, result)
    if (snapshotError !== null || snapshot === null) {
      this.complete(
        queued,
        current,
        queued.run,
        "failed",
        "snapshot failed",
        snapshotError ?? "snapshot failed",
        null,
      )
      return
    }

    this.complete(queued, current, queued.run, "succeeded", "analysis complete", null, snapshot.id)
  }

  private async persist(
    project: ProjectRecord,
    job: JobRecord,
    result: Awaited<ReturnType<AnalysisExecutor["execute"]>>[0],
  ): Promise<Result<SnapshotRecord, string>> {
    if (result === null) return fail("analysis result unavailable")

    const identity = SnapshotIdentityFactory.create({
      projectId: project.id,
      commit: result.commit,
      dirty: result.dirty,
      analyzer: result.analyzer,
      analyzerVersion: result.analyzerVersion,
      schemaVersion: 1,
      ruleVersion: result.ruleVersion,
      promptVersion: result.promptVersion,
      modelVersion: result.modelVersion,
      inputHashes: result.files.map((file) => file.hash),
    })
    const existing = this.snapshots.find(identity.id)
    if (existing !== null) return ok(existing)

    const [config, configError] = await new SpecFrameworkConfigLoader(project.repositoryPath).load()
    if (configError !== null || config === null) {
      return fail(configError ?? "spec-framework.json unavailable")
    }
    const provisional: SnapshotRecord = {
      id: identity.id,
      projectId: project.id,
      runId: job.id,
      commit: result.commit,
      dirty: result.dirty,
      analyzer: result.analyzer,
      analyzerVersion: result.analyzerVersion,
      schemaVersion: 1,
      ruleVersion: result.ruleVersion,
      promptVersion: result.promptVersion,
      modelVersion: result.modelVersion,
      fingerprint: identity.fingerprint,
      nodeCount: result.nodes.length,
      edgeCount: result.edges.length,
      flowCount: result.flows.length,
      findingCount: result.findings.length,
      mapping: result.mapping,
      coverage: result.coverage ?? EMPTY_COVERAGE,
      createdAt: this.now(),
    }
    const projection = new SystemProjectionBuilder().build({
      project,
      snapshot: provisional,
      elements: result.nodes,
      relationships: result.edges,
      entryPoints: result.entryPoints,
    })
    const diagnostics = new DiagnosticsEngine().run({
      elements: result.nodes,
      relationships: result.edges,
      entryPoints: result.entryPoints,
      coverage: projection.coverage,
      config: DiagnosticsConfigFactory.fromRecord(config.diagnostics),
    })
    const architectureIds = new Set(projection.nodes.map((node) => node.id))
    const findings = [...result.findings, ...diagnostics].filter((finding) =>
      finding.affectedElements.every((id) => architectureIds.has(id)),
    )
    const snapshot: SnapshotRecord = {
      ...provisional,
      findingCount: findings.length,
      mapping: { coverage: projection.coverage },
      coverage: projection.coverage,
    }
    const generatedSpec = await new GeneratedSpecBuilder().build({
      root: project.repositoryPath,
      config,
      project,
      snapshot,
      elements: result.nodes,
      relationships: result.edges,
      entryPoints: result.entryPoints,
      flows: result.flows,
      findings,
    })
    const [created, createError] = this.snapshots.create(snapshot)
    if (createError !== null || created === null) return fail(createError ?? "snapshot failed")

    const artifacts = result.files.map((file): CodeArtifactRecord => ({
      id: AnalysisIds.artifact(created.id, file.path),
      snapshotId: created.id,
      path: file.path,
      language: file.language,
      hash: file.hash,
      size: file.size,
      lineCount: file.lineCount,
      modifiedAt: file.modifiedAt,
    }))
    const [, artifactsError] = this.artifacts.replace(created.id, artifacts)
    if (artifactsError !== null) return fail(artifactsError)
    const [, elementsError] = this.elements.replace(created.id, result.nodes)
    if (elementsError !== null) return fail(elementsError)
    const [, relationshipsError] = this.relationships.replace(created.id, result.edges)
    if (relationshipsError !== null) return fail(relationshipsError)
    const [, entryPointsError] = this.entryPoints.replace(created.id, result.entryPoints)
    if (entryPointsError !== null) return fail(entryPointsError)
    const [, findingsError] = this.findings.replace(created.id, findings)
    if (findingsError !== null) return fail(findingsError)
    const [, flowsError] = this.flows.replace(created.id, result.flows)
    if (flowsError !== null) return fail(flowsError)
    const [, specError] = this.generatedSpecs.save(created.id, generatedSpec)
    if (specError !== null) return fail(specError)
    const [, specWriteError] = await new GeneratedSpecWriter(project.repositoryPath).write(
      generatedSpec,
    )
    if (specWriteError !== null) return fail(specWriteError)

    const [, exportError] = await AnalysisArtifactExporter.write(project.repositoryPath, {
      snapshot: created,
      artifacts,
      nodes: result.nodes,
      edges: result.edges,
      flows: result.flows,
      findings,
      annotations: this.annotations.list(project.id),
    })
    if (exportError !== null) return fail(exportError)

    return ok(created)
  }

  private report(job: JobRecord, progress: AnalysisProgress): JobRecord {
    const updated = this.transition(
      job,
      "running",
      progress.phase,
      progress.progress,
      progress.message,
    )
    this.emit(updated, "progress", progress.message)

    return updated
  }

  private transition(
    job: JobRecord,
    state: JobState,
    phase: string,
    progress: number,
    message: string,
  ): JobRecord {
    const updated: JobRecord = {
      ...job,
      state,
      phase,
      progress: Math.min(1, Math.max(0, progress)),
      message,
      startedAt: job.startedAt ?? this.now(),
    }
    this.jobs.update(updated)

    return updated
  }

  private complete(
    queued: QueuedJob,
    job: JobRecord,
    run: AnalysisRunRecord | null,
    state: JobState,
    message: string,
    error: string | null,
    snapshotId: string | null,
  ): Result<JobRecord, string> {
    const finished: JobRecord = {
      ...job,
      state,
      progress: 1,
      message,
      error,
      snapshotId,
      startedAt: job.startedAt ?? this.now(),
      finishedAt: this.now(),
    }
    const [, updateError] = this.jobs.update(finished)
    if (run !== null) {
      this.runs.update({
        ...run,
        state,
        startedAt: run.startedAt ?? finished.startedAt,
        finishedAt: finished.finishedAt,
        error,
      })
    }
    this.active.delete(job.id)
    const type: JobEventType =
      state === "succeeded" ? "completed" : state === "failed" ? "failed" : "cancelled"
    this.emit(finished, type, error ?? message)
    this.pump()

    if (updateError !== null) return fail(updateError)

    return ok(finished)
  }

  private emit(job: JobRecord, type: JobEventType, message: string): void {
    this.events.publish({
      job_id: job.id,
      type,
      phase: job.phase,
      progress: job.progress,
      message,
      timestamp: this.now(),
    })
  }
}
