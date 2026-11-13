import { basename } from "node:path"
import type { Result } from "../core/result"
import { fail, ok } from "../core/result"
import type { AnalysisOptions, ProjectRecord } from "../persistence"
import { DEFAULT_ANALYSIS_OPTIONS, ProjectRepository } from "../persistence"
import type { AnalysisRootPolicy } from "./root-policy"

export interface RegisterProjectRequest {
  name?: string
  repositoryPath: string
  analysisOptions?: Partial<AnalysisOptions>
}

export class ProjectRegistry {
  constructor(
    private readonly policy: AnalysisRootPolicy,
    private readonly projects: ProjectRepository,
  ) {}

  async register(request: RegisterProjectRequest): Promise<Result<ProjectRecord, string>> {
    const [repositoryPath, pathError] = await this.policy.resolve(request.repositoryPath)
    if (pathError !== null || repositoryPath === null) return fail(pathError ?? "invalid path")

    const name = request.name?.trim() || basename(repositoryPath)
    const options: AnalysisOptions = {
      ...DEFAULT_ANALYSIS_OPTIONS,
      ...request.analysisOptions,
    }

    return this.projects.save(name, repositoryPath, options)
  }

  list(): ProjectRecord[] {
    return this.projects.list()
  }

  find(id: string): ProjectRecord | null {
    return this.projects.find(id)
  }

  async validate(project: ProjectRecord): Promise<Result<ProjectRecord, string>> {
    const [repositoryPath, pathError] = await this.policy.resolve(project.repositoryPath)
    if (pathError !== null || repositoryPath === null) return fail(pathError ?? "invalid path")
    if (repositoryPath !== project.repositoryPath) {
      return fail("registered repository path changed since registration")
    }

    return ok(project)
  }

  remove(id: string): Result<null, string> {
    if (!this.projects.remove(id)) return fail(`project '${id}' was not found`)

    return ok(null)
  }
}
