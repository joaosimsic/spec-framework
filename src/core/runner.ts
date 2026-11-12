import { existsSync } from "node:fs"
import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "./result"

export interface CommandSpec {
  executable: string
  arguments: string[]
  workingDirectory: string
  timeoutMs?: number
  environment?: Record<string, string>
}

export function localToolCandidates(target: string, command: string): string[] {
  return [
    join(target, ".spec", "tools", "bin", command),
    join(target, ".spec", "tools", "node_modules", ".bin", command),
    join(target, "node_modules", ".bin", command),
  ]
}

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type CommandFailureCode = "COMMAND_SPAWN_FAILED" | "COMMAND_IO_FAILED" | "COMMAND_TIMEOUT"

export interface CommandFailure {
  code: CommandFailureCode
  message: string
}

export interface ProcessRunner {
  run(spec: CommandSpec): Promise<Result<CommandResult, CommandFailure>>
}

export interface ToolLocator {
  resolve(command: string): Promise<string | null>
}

export class ToolResolver implements ToolLocator {
  constructor(private readonly target: string) {}

  async resolve(command: string): Promise<string | null> {
    const localExecutable = localToolCandidates(this.target, command).find((candidate) =>
      existsSync(candidate),
    )
    if (localExecutable !== undefined) return localExecutable

    return Bun.which(command)
  }
}

export class BunProcessRunner implements ProcessRunner {
  private readonly defaultTimeoutMs = 120_000

  async run(spec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
    const timeoutMs = spec.timeoutMs ?? this.defaultTimeoutMs

    const [childProcess, spawnError] = attempt(() =>
      Bun.spawn({
        cmd: [spec.executable, ...spec.arguments],
        cwd: spec.workingDirectory,
        env: { ...process.env, ...spec.environment },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      }),
    )
    if (spawnError) {
      return [null, { code: "COMMAND_SPAWN_FAILED", message: spawnError }]
    }
    if (childProcess === null) {
      return [null, { code: "COMMAND_SPAWN_FAILED", message: "process did not start" }]
    }

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      attempt(() => childProcess.kill("SIGKILL"))
    }, timeoutMs)

    const [result, ioError] = await attemptAsync(async () => {
      const [stdout, stderr] = await Promise.all([
        new Response(childProcess.stdout).text(),
        new Response(childProcess.stderr).text(),
      ])
      const exitCode = await childProcess.exited
      return { exitCode, stdout, stderr }
    })
    clearTimeout(timeout)

    if (timedOut) {
      return [null, { code: "COMMAND_TIMEOUT", message: `command timed out after ${timeoutMs}ms` }]
    }
    if (ioError) {
      return [null, { code: "COMMAND_IO_FAILED", message: ioError }]
    }
    if (result === null) {
      return [null, { code: "COMMAND_IO_FAILED", message: "process produced no result" }]
    }

    return [result, null]
  }
}
