import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "./result"

export interface CommandSpec {
  executable: string
  arguments: string[]
  workingDirectory: string
  timeoutMs?: number
}

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type CommandFailureCode =
  | "COMMAND_SPAWN_FAILED"
  | "COMMAND_IO_FAILED"
  | "COMMAND_TIMEOUT"

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
    const localExecutable = join(this.target, "node_modules", ".bin", command)
    const [exists, existsError] = await attemptAsync(() => Bun.file(localExecutable).exists())
    if (!existsError && exists) return localExecutable

    return Bun.which(command)
  }
}

export class BunProcessRunner implements ProcessRunner {
  private readonly defaultTimeoutMs = 120_000

  async run(spec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
    const timeoutMs = spec.timeoutMs ?? this.defaultTimeoutMs

    const [process, spawnError] = attempt(() =>
      Bun.spawn({
        cmd: [spec.executable, ...spec.arguments],
        cwd: spec.workingDirectory,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      }),
    )
    if (spawnError) {
      return [null, { code: "COMMAND_SPAWN_FAILED", message: spawnError }]
    }
    if (process === null) {
      return [null, { code: "COMMAND_SPAWN_FAILED", message: "process did not start" }]
    }

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      attempt(() => process.kill("SIGKILL"))
    }, timeoutMs)

    const [result, ioError] = await attemptAsync(async () => {
      const [stdout, stderr] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
      ])
      const exitCode = await process.exited
      return { exitCode, stdout, stderr }
    })
    clearTimeout(timeout)

    if (timedOut) {
      return [
        null,
        { code: "COMMAND_TIMEOUT", message: `command timed out after ${timeoutMs}ms` },
      ]
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
