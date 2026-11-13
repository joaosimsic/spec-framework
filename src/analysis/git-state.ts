import { attempt, type Result, fail, ok } from "../core/result"

export interface GitState {
  commit: string
  clean: boolean
}

export class GitStateReader {
  read(root: string): Result<GitState, string> {
    const [commit, commitError] = attempt(() =>
      Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" }),
    )
    if (commitError !== null || commit === null || commit.exitCode !== 0) {
      return fail(commitError ?? "git commit unavailable")
    }
    const [status, statusError] = attempt(() =>
      Bun.spawnSync(["git", "status", "--porcelain"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      }),
    )
    if (statusError !== null || status === null || status.exitCode !== 0) {
      return fail(statusError ?? "git status unavailable")
    }

    return ok({
      commit: Buffer.from(commit.stdout).toString("utf8").trim(),
      clean: Buffer.from(status.stdout).toString("utf8").trim() === "",
    })
  }
}
