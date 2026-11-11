import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RustAdapter } from "../src/adapters/rust"
import type { Result } from "../src/core/result"
import type {
  CommandFailure,
  CommandResult,
  CommandSpec,
  ProcessRunner,
  ToolLocator,
} from "../src/core/runner"

class FakeToolLocator implements ToolLocator {
  constructor(private readonly missing: string[] = []) {}

  async resolve(commandName: string): Promise<string | null> {
    if (this.missing.includes(commandName)) return null

    return `/bin/${commandName}`
  }
}

class FakeProcessRunner implements ProcessRunner {
  readonly calls: CommandSpec[] = []

  constructor(private readonly queuedResults: Result<CommandResult, CommandFailure>[]) {}

  async run(commandSpec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
    this.calls.push(commandSpec)
    const callIndex = this.calls.length - 1
    const result = this.queuedResults[callIndex]

    return result ?? [{ exitCode: 0, stdout: "", stderr: "" }, null]
  }
}

const publicApiOutput = "pub fn kvpack::read(path: &str) -> Result<Vec<u8>, Error>\n"

const validPolicy = {
  id: "CON-API-001",
  owner: "library",
  consumers: ["cli"],
  compatibility: "backward",
  package: "kvpack",
  manifest: "Cargo.toml",
  baseline: { rev: "v1.0.0" },
}

async function createTarget(): Promise<{ target: string; contractDirectory: string }> {
  const target = await mkdtemp(join(tmpdir(), "rust-contract-"))
  const contractDirectory = join(target, "spec", "contracts", "rust")
  await mkdir(contractDirectory, { recursive: true })

  return { target, contractDirectory }
}

async function writeContractFile(
  contractDirectory: string,
  fileName: string,
  policy: unknown,
): Promise<string> {
  const contractFile = join(contractDirectory, fileName)
  await writeFile(contractFile, JSON.stringify(policy, null, 2))

  return contractFile
}

async function writeBaseline(
  target: string,
  contractBaseName: string,
  publicApi: string,
): Promise<void> {
  const baselinesDirectory = join(target, "spec", "contracts", ".baselines")
  await mkdir(baselinesDirectory, { recursive: true })
  const hash = createHash("sha256").update(publicApi, "utf8").digest("hex")
  const baselineFile = join(baselinesDirectory, `${contractBaseName}.rust-public-api.sha256`)
  await writeFile(baselineFile, `${hash}\n`)
}

function runAdapter(
  target: string,
  queuedResults: Result<CommandResult, CommandFailure>[],
  missing: string[] = [],
) {
  const processRunner = new FakeProcessRunner(queuedResults)
  const toolLocator = new FakeToolLocator(missing)
  const runPromise = new RustAdapter().run({ target, processRunner, toolLocator })

  return { processRunner, runPromise }
}

describe("RustAdapter", () => {
  test("passes with matching baseline and compatible API", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)
      await writeBaseline(target, "kvpack", publicApiOutput.trim())
      const { processRunner, runPromise } = runAdapter(target, [
        [{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null],
        [{ exitCode: 0, stdout: "no semver violations", stderr: "" }, null],
      ])

      const run = await runPromise

      expect(run.ran).toBe(true)
      expect(run.diagnostics).toEqual([])
      expect(processRunner.calls).toHaveLength(2)
      expect(processRunner.calls[0]?.executable).toBe("/bin/cargo-public-api")
      expect(processRunner.calls[0]?.arguments).toContain("--manifest-path")
      expect(processRunner.calls[0]?.arguments).toContain("--package")
      expect(processRunner.calls[0]?.arguments).toContain("-sss")
      expect(processRunner.calls[1]?.executable).toBe("/bin/cargo-semver-checks")
      expect(processRunner.calls[1]?.arguments).toContain("--baseline-rev")
      expect(processRunner.calls[1]?.arguments).toContain("v1.0.0")
      expect(run.evidence?.[0]?.id).toBe("EVD-CON-API-001")
      expect(run.evidence?.[0]?.result).toBe("pass")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("emits no-sources when no sidecars exist", async () => {
    const { target } = await createTarget()
    try {
      const { processRunner, runPromise } = runAdapter(target, [])
      const run = await runPromise

      expect(run.diagnostics).toHaveLength(1)
      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-NO-SOURCES")
      expect(processRunner.calls).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a sidecar without a compatibility policy", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      const contractFile = await writeContractFile(contractDirectory, "bad.contract.json", {
        id: "CON-API-001",
        owner: "library",
        consumers: ["cli"],
        package: "kvpack",
      })
      const { processRunner, runPromise } = runAdapter(target, [])
      const run = await runPromise

      expect(run.diagnostics).toHaveLength(1)
      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-POLICY")
      expect(run.diagnostics[0]?.file).toBe(contractFile)
      expect(processRunner.calls).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("requires a baseline for non-none compatibility", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      const { baseline: _baseline, ...withoutBaseline } = validPolicy
      const contractFile = await writeContractFile(
        contractDirectory,
        "kvpack.contract.json",
        withoutBaseline,
      )
      const { runPromise } = runAdapter(target, [])
      const run = await runPromise

      expect(run.diagnostics).toHaveLength(1)
      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-POLICY")
      expect(run.diagnostics[0]?.file).toBe(contractFile)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a baseline with multiple sources", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", {
        ...validPolicy,
        baseline: { rev: "v1.0.0", version: "1.0.0" },
      })
      const { runPromise } = runAdapter(target, [])
      const run = await runPromise

      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-POLICY")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a missing cargo-public-api tool", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)
      const { runPromise } = runAdapter(target, [], ["cargo-public-api"])
      const run = await runPromise

      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-MISSING-TOOL")
      expect(run.diagnostics[0]?.message).toContain("cargo-public-api")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a missing cargo-semver-checks tool", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)
      await writeBaseline(target, "kvpack", publicApiOutput.trim())
      const { runPromise } = runAdapter(
        target,
        [[{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null]],
        ["cargo-semver-checks"],
      )
      const run = await runPromise

      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-MISSING-TOOL")
      expect(run.diagnostics[0]?.message).toContain("cargo-semver-checks")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports public API extraction failure", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)
      const { runPromise } = runAdapter(target, [
        [{ exitCode: 1, stdout: "", stderr: "cargo failed" }, null],
      ])
      const run = await runPromise

      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-PUBLIC-API")
      expect(run.diagnostics[0]?.message).toContain("cargo failed")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("warns when the public API baseline is absent", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)
      const { runPromise } = runAdapter(target, [
        [{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null],
        [{ exitCode: 0, stdout: "", stderr: "" }, null],
      ])
      const run = await runPromise

      expect(run.diagnostics).toHaveLength(1)
      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-NO-BASELINE")
      expect(run.diagnostics[0]?.level).toBe("warning")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a mismatched public API baseline", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)
      await writeBaseline(target, "kvpack", "pub fn kvpack::old()")
      const { runPromise } = runAdapter(target, [
        [{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null],
        [{ exitCode: 0, stdout: "", stderr: "" }, null],
      ])
      const run = await runPromise

      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-CHANGED")
      expect(run.diagnostics[0]?.message).toContain("expected")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports incompatible public API changes", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)
      await writeBaseline(target, "kvpack", publicApiOutput.trim())
      const { runPromise } = runAdapter(target, [
        [{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null],
        [{ exitCode: 1, stdout: "removed function", stderr: "" }, null],
      ])
      const run = await runPromise

      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-INCOMPATIBLE")
      expect(run.diagnostics[0]?.message).toContain("removed function")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("skips compatibility checks for compatibility none", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", {
        ...validPolicy,
        compatibility: "none",
        baseline: undefined,
      })
      const { processRunner, runPromise } = runAdapter(target, [
        [{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null],
      ])
      const run = await runPromise

      expect(run.diagnostics).toEqual([])
      expect(processRunner.calls).toHaveLength(1)
      expect(processRunner.calls[0]?.executable).toBe("/bin/cargo-public-api")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("maps baseline version and root to the right flags", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", {
        ...validPolicy,
        baseline: { version: "1.0.0" },
      })
      await writeBaseline(target, "kvpack", publicApiOutput.trim())
      const versionRun = runAdapter(target, [
        [{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null],
        [{ exitCode: 0, stdout: "", stderr: "" }, null],
      ])
      await versionRun.runPromise

      expect(versionRun.processRunner.calls[1]?.arguments).toContain("--baseline-version")
      expect(versionRun.processRunner.calls[1]?.arguments).toContain("1.0.0")

      await writeContractFile(contractDirectory, "kvpack.contract.json", {
        ...validPolicy,
        baseline: { root: "baseline" },
      })
      const rootRun = runAdapter(target, [
        [{ exitCode: 0, stdout: publicApiOutput, stderr: "" }, null],
        [{ exitCode: 0, stdout: "", stderr: "" }, null],
      ])
      await rootRun.runPromise

      expect(rootRun.processRunner.calls[1]?.arguments).toContain("--baseline-root")
      expect(rootRun.processRunner.calls[1]?.arguments).toContain(join(target, "baseline"))
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects manifest paths outside the project", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", {
        ...validPolicy,
        manifest: "../outside/Cargo.toml",
      })
      const { runPromise } = runAdapter(target, [])
      const run = await runPromise

      expect(run.diagnostics[0]?.code).toBe("CONTRACT-RUST-POLICY")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("RustAdapter.detect", () => {
  test("detects a root Cargo manifest", async () => {
    const target = await mkdtemp(join(tmpdir(), "rust-detect-"))
    try {
      await writeFile(join(target, "Cargo.toml"), '[package]\nname = "sample"\n')

      expect(await new RustAdapter().detect(target)).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("detects a nested Cargo manifest", async () => {
    const target = await mkdtemp(join(tmpdir(), "rust-detect-"))
    try {
      const crateDirectory = join(target, "crates", "sample")
      await mkdir(crateDirectory, { recursive: true })
      await writeFile(join(crateDirectory, "Cargo.toml"), '[package]\nname = "sample"\n')

      expect(await new RustAdapter().detect(target)).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("detects Rust contract sidecars without a manifest", async () => {
    const { target, contractDirectory } = await createTarget()
    try {
      await writeContractFile(contractDirectory, "kvpack.contract.json", validPolicy)

      expect(await new RustAdapter().detect(target)).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("ignores manifests in generated directories", async () => {
    const target = await mkdtemp(join(tmpdir(), "rust-detect-"))
    try {
      const generatedDirectory = join(target, "node_modules", "dep")
      await mkdir(generatedDirectory, { recursive: true })
      await writeFile(join(generatedDirectory, "Cargo.toml"), '[package]\nname = "dep"\n')

      expect(await new RustAdapter().detect(target)).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
