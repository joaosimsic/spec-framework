import { basename } from "node:path"
import { ok, fail, type Result } from "../core/result"
import { TypeScriptAnalysisExecutor } from "../analysis/executor"
import {
  AiRunRepository,
  AnalysisDatabase,
  AnnotationRepository,
  FindingRepository,
  FlowRepository,
  GeneratedSpecRepository,
  ProjectRepository,
  SnapshotRepository,
  ElementRepository,
  RelationshipRepository,
  EntryPointRepository,
  CodeArtifactRepository,
} from "../persistence"
import type { ProjectRecord, SnapshotRecord } from "../persistence"
import {
  SnapshotComparator,
  type SnapshotComparison,
  type SnapshotData,
} from "../analysis/comparison"
import { AnalysisJobRunner, JobEventBus } from "../jobs"
import { AnalysisRootPolicy, ProjectRegistry } from "../projects"
import { SystemProjectionService } from "../implementation"
import { AiConfigLoader } from "../ai/config"
import { OpenAiCompatibleProvider } from "../ai/provider"
import { AiInterpreter } from "../ai/interpreter"
import type { AiConfig, AiProvider } from "../ai/types"

export interface AnalysisRuntimeOptions {
  analysisRoots?: string[]
  concurrency?: number
  now?: () => string
  aiConfig?: AiConfig
  aiProvider?: AiProvider
}

export class AnalysisRuntime {
  private constructor(
    readonly database: AnalysisDatabase,
    readonly projects: ProjectRegistry,
    readonly projectRecords: ProjectRepository,
    readonly snapshots: SnapshotRepository,
    readonly flows: FlowRepository,
    readonly findings: FindingRepository,
    readonly annotations: AnnotationRepository,
    readonly generatedSpecs: GeneratedSpecRepository,
    readonly jobs: AnalysisJobRunner,
    readonly system: SystemProjectionService,
    readonly elements: ElementRepository,
    readonly entryPoints: EntryPointRepository,
    readonly relationships: RelationshipRepository,
    readonly artifacts: CodeArtifactRepository,
    readonly aiRuns: AiRunRepository,
    readonly aiConfig: AiConfig | null,
    readonly aiProvider: AiProvider | null,
    private readonly currentPath: string,
  ) {}

  interpreter(): AiInterpreter | null {
    if (this.aiConfig === null || this.aiProvider === null) return null

    return new AiInterpreter(this.aiConfig, this.aiProvider, this.aiRuns)
  }

  static async create(
    target: string,
    options: AnalysisRuntimeOptions = {},
  ): Promise<Result<AnalysisRuntime, string>> {
    const [policy, policyError] = await AnalysisRootPolicy.create(
      target,
      options.analysisRoots ?? [],
    )
    if (policyError !== null || policy === null) {
      return fail(policyError ?? "analysis root policy unavailable")
    }

    const [database, databaseError] = AnalysisDatabase.open(target)
    if (databaseError !== null || database === null) {
      return fail(databaseError ?? "analysis database unavailable")
    }

    const projectRecords = new ProjectRepository(database)
    const registry = new ProjectRegistry(policy, projectRecords)
    const [, registerError] = await registry.register({
      name: basename(target),
      repositoryPath: target,
    })
    if (registerError !== null) {
      database.close()
      return fail(registerError)
    }
    const executor = new TypeScriptAnalysisExecutor()
    const [loadedConfig] = await new AiConfigLoader().load()
    const aiConfig = options.aiConfig ?? loadedConfig
    const aiProvider =
      options.aiProvider ?? (aiConfig === null ? null : new OpenAiCompatibleProvider(aiConfig))
    const runner = new AnalysisJobRunner(database, executor, new JobEventBus(), {
      concurrency: options.concurrency,
      now: options.now,
    })

    return ok(
      new AnalysisRuntime(
        database,
        registry,
        projectRecords,
        new SnapshotRepository(database),
        new FlowRepository(database),
        new FindingRepository(database),
        new AnnotationRepository(database),
        new GeneratedSpecRepository(database),
        runner,
        new SystemProjectionService(target, database),
        new ElementRepository(database),
        new EntryPointRepository(database),
        new RelationshipRepository(database),
        new CodeArtifactRepository(database),
        new AiRunRepository(database),
        aiConfig,
        aiProvider,
        target,
      ),
    )
  }

  spec(project: ProjectRecord): import("../spec").GeneratedSpec | null {
    return this.generatedSpecs.latest(project.id)
  }

  latest(project: ProjectRecord): SnapshotRecord | null {
    return this.snapshots.latest(project.id)
  }

  currentProject(): ProjectRecord | null {
    return this.projectRecords.findByPath(this.currentPath)
  }

  compare(fromId: string, toId: string): SnapshotComparison | null {
    const from = this.snapshots.find(fromId)
    const to = this.snapshots.find(toId)
    if (from === null || to === null) return null

    return SnapshotComparator.compare(this.snapshotData(from), this.snapshotData(to))
  }

  private snapshotData(snapshot: SnapshotRecord): SnapshotData {
    return {
      id: snapshot.id,
      commit: snapshot.commit,
      elements: this.elements.list(snapshot.id),
      relationships: this.relationships.list(snapshot.id),
      flows: this.flows.list(snapshot.id),
      findings: this.findings.list(snapshot.id),
      entryPoints: this.entryPoints.list(snapshot.id),
      coverage: snapshot.coverage,
    }
  }

  findFinding(
    findingId: string,
  ): { finding: import("../analysis/ir").IrFinding; snapshot: SnapshotRecord } | null {
    for (const project of this.projectRecords.list()) {
      for (const snapshot of this.snapshots.list(project.id)) {
        const finding = this.findings.list(snapshot.id).find((item) => item.id === findingId)
        if (finding !== undefined) return { finding, snapshot }
      }
    }

    return null
  }

  findFlow(
    flowId: string,
  ): { flow: import("../analysis/ir").IrFlow; snapshot: SnapshotRecord } | null {
    for (const project of this.projectRecords.list()) {
      for (const snapshot of this.snapshots.list(project.id)) {
        const flow = this.flows.find(snapshot.id, flowId)
        if (flow !== null) return { flow, snapshot }
      }
    }

    return null
  }

  close(): void {
    this.database.close()
  }
}
