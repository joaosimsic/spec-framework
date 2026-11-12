import { cp, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { attempt, attemptAsync, type Result } from "../../src/core/result"

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".spec",
  "_apalache-out",
  "coverage",
  "dist",
  "node_modules",
  "result",
  "tmp",
])

const EXCLUDED_PATHS = new Set(["spec/audit", "spec/evidence", "src/workbench/web/dist"])

export interface MvpWorkspaceContext {
  root: string
  target: string
  cleanup(): Promise<void>
}

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface CommandOptions {
  input?: string
}

export class MvpWorkspace {
  static async create(repoRoot: string): Promise<Result<MvpWorkspaceContext, string>> {
    const [root, rootError] = await attemptAsync(() => mkdtemp(join(tmpdir(), "spec-mvp-")))
    if (rootError !== null || root === null) {
      return [null, rootError ?? "cannot create MVP workspace"]
    }

    const target = join(root, "repo")
    const [, copyError] = await attemptAsync(() =>
      cp(repoRoot, target, {
        recursive: true,
        filter: (source) => this.included(repoRoot, source),
      }),
    )
    if (copyError !== null) return [null, `cannot copy workspace: ${copyError}`]

    const toolDirectory = join(repoRoot, ".spec", "tools")
    const [toolsReady, toolsError] = await attemptAsync(() =>
      Bun.file(join(toolDirectory, "package.json")).exists(),
    )
    if (toolsError !== null || toolsReady !== true) {
      return [null, "project-local tools are missing; run spec doctor --fix first"]
    }

    const [, linkError] = await attemptAsync(async () => {
      await this.linkDirectory(repoRoot, target, "node_modules")
      await this.linkDirectory(repoRoot, target, "plugin/opencode/node_modules")
      await mkdir(join(target, ".spec"), { recursive: true })
      await symlink(toolDirectory, join(target, ".spec", "tools"), "dir")
    })
    if (linkError !== null) return [null, `cannot link MVP dependencies: ${linkError}`]

    return [
      {
        root,
        target,
        cleanup: async () => {
          await rm(root, { recursive: true, force: true })
        },
      },
      null,
    ]
  }

  private static async linkDirectory(
    repoRoot: string,
    target: string,
    path: string,
  ): Promise<void> {
    const source = join(repoRoot, path)
    const [info, statError] = await attemptAsync(() => stat(source))
    if (statError !== null || info === null || !info.isDirectory()) return

    const destination = join(target, path)
    await mkdir(join(destination, ".."), { recursive: true })
    await symlink(source, destination, "dir")
  }

  private static included(repoRoot: string, source: string): boolean {
    const path = relative(repoRoot, source)
    if (path === "") return true

    const segments = path.split(/[\\/]/)
    if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) return false

    return ![...EXCLUDED_PATHS].some(
      (excluded) => path === excluded || path.startsWith(`${excluded}/`),
    )
  }
}

export class MvpRunner {
  private readonly environment: Record<string, string>
  private readonly executable: string
  private readonly cli: string

  constructor(
    private readonly repoRoot: string,
    private readonly workspace: MvpWorkspaceContext,
  ) {
    this.executable = process.execPath
    this.cli = join(repoRoot, "bin", "spec.ts")
    this.environment = {
      ...process.env,
      PATH: [
        join(repoRoot, ".spec", "tools", "bin"),
        join(repoRoot, ".spec", "tools", "node_modules", ".bin"),
        process.env.PATH ?? "",
      ]
        .filter(Boolean)
        .join(":"),
    }
  }

  async spec(
    argumentsList: string[],
    options: CommandOptions = {},
  ): Promise<Result<CommandResult, string>> {
    return this.run(this.executable, [this.cli, ...argumentsList], options)
  }

  async git(
    argumentsList: string[],
    options: CommandOptions = {},
  ): Promise<Result<CommandResult, string>> {
    return this.run("git", argumentsList, options)
  }

  async initializeGit(): Promise<Result<CommandResult, string>> {
    const commands = [
      ["init", "-b", "main"],
      ["config", "user.email", "mvp@example.com"],
      ["config", "user.name", "spec mvp"],
      ["add", "."],
      ["commit", "-m", "mvp baseline"],
    ]

    let last: CommandResult | null = null
    for (const command of commands) {
      const [result, error] = await this.git(command)
      if (error !== null) return [null, error]
      if (result === null || result.code !== 0) {
        return [null, `git ${command.join(" ")} failed\n${result?.stderr ?? "no result"}`]
      }
      last = result
    }

    return [last, null]
  }

  private async run(
    executable: string,
    argumentsList: string[],
    options: CommandOptions,
  ): Promise<Result<CommandResult, string>> {
    const [child, spawnError] = attempt(() =>
      Bun.spawn({
        cmd: [executable, ...argumentsList],
        cwd: this.workspace.target,
        env: this.environment,
        stdin: options.input === undefined ? "ignore" : "pipe",
        stdout: "pipe",
        stderr: "pipe",
      }),
    )
    if (spawnError !== null || child === null) {
      return [null, spawnError ?? "process did not start"]
    }

    if (options.input !== undefined) {
      const stdin = child.stdin
      if (stdin === undefined) return [null, "process input is unavailable"]
      const [, writeError] = await attemptAsync(async () => {
        stdin.write(options.input ?? "")
        await stdin.end()
      })
      if (writeError !== null) return [null, `cannot send process input: ${writeError}`]
    }

    const [result, readError] = await attemptAsync(async () => {
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])

      return { code, stdout, stderr }
    })
    if (readError !== null || result === null) {
      return [null, readError ?? "cannot read process output"]
    }

    return [result, null]
  }
}

export class MvpFailure {
  static command(label: string, result: CommandResult): string {
    const details = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n")

    return `${label} failed with exit code ${result.code}${details === "" ? "" : `\n${details}`}`
  }

  static missing(label: string, result: CommandResult): string {
    return `${label} failed\n${[result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n")}`
  }
}
