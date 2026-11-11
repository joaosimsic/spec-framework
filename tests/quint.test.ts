import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { QuintAdapter } from "../src/adapters/quint"
import type { Result } from "../src/core/result"
import type { CommandFailure, CommandResult, CommandSpec, ProcessRunner, ToolLocator } from "../src/core/runner"

class FakeToolLocator implements ToolLocator {
    constructor(private readonly quintExecutable: string | null, private readonly javaExecutable: string | null = "/bin/java") {}
    async resolve(command: string): Promise<string | null> {
        if (command === "java") return this.javaExecutable
        return this.quintExecutable
    }
}

class FakeProcessRunner implements ProcessRunner {
    readonly calls: CommandSpec[] = []
    constructor(private readonly queuedResults: Result<CommandResult, CommandFailure>[]) {}
    async run(commandSpec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
        this.calls.push(commandSpec)
        const callIndex = this.calls.length - 1
        return this.queuedResults[Math.min(callIndex, this.queuedResults.length - 1)] ?? [{ exitCode: 0, stdout: "", stderr: "" }, null]
    }
}

async function runAdapter(target: string, queuedResults: Result<CommandResult, CommandFailure>[], quintExecutable: string | null = "/bin/quint", javaExecutable: string | null = "/bin/java") {
    const processRunner = new FakeProcessRunner(queuedResults)
    const run = await new QuintAdapter().run({ target, processRunner, toolLocator: new FakeToolLocator(quintExecutable, javaExecutable) })
    return { processRunner, run }
}

async function createFormalTarget(): Promise<{ target: string, quintFile: string, formalDirectory: string }> {
    const target = await mkdtemp(join(tmpdir(), "quint-"))
    const formalDirectory = join(target, "spec", "formal")
    const quintFile = join(formalDirectory, "example.qnt")
    await mkdir(formalDirectory, { recursive: true })
    await writeFile(quintFile, "module example { }")
    return { target, quintFile, formalDirectory }
}

describe("QuintAdapter", () => {
    test("passes typecheck with no diagnostics", async () => {
        const { target, quintFile, formalDirectory } = await createFormalTarget()
        await writeFile(join(formalDirectory, "quint.json"), JSON.stringify({ maxSteps: 5, invariants: { "example.qnt": ["noNegative"] } }))
        const success: Result<CommandResult, CommandFailure> = [{ exitCode: 0, stdout: "", stderr: "" }, null]
        const { processRunner, run } = await runAdapter(target, [success, success])
        expect(run.ran).toBe(true)
        expect(run.diagnostics).toEqual([])
        expect(processRunner.calls[0]?.arguments).toContain("typecheck")
        expect(processRunner.calls[0]?.arguments).toContain(quintFile)
    })

    test("maps typecheck failure to a diagnostic", async () => {
        const { target, quintFile, formalDirectory } = await createFormalTarget()
        await writeFile(join(formalDirectory, "quint.json"), JSON.stringify({ maxSteps: 5, invariants: { "example.qnt": ["noNegative"] } }))
        const typecheckFailure: Result<CommandResult, CommandFailure> = [{ exitCode: 1, stdout: "", stderr: "An error occurred" }, null]
        const verifySuccess: Result<CommandResult, CommandFailure> = [{ exitCode: 0, stdout: "", stderr: "" }, null]
        const { run } = await runAdapter(target, [typecheckFailure, verifySuccess])
        expect(run.diagnostics).toHaveLength(1)
        expect(run.diagnostics[0]?.code).toBe("FORMAL-QUINT-TYPECHECK")
        expect(run.diagnostics[0]?.file).toBe(quintFile)
    })

    test("emits no-sources when formal dir has no quint files", async () => {
        const target = await mkdtemp(join(tmpdir(), "quint-"))
        await mkdir(join(target, "spec", "formal"), { recursive: true })
        const success: Result<CommandResult, CommandFailure> = [{ exitCode: 0, stdout: "", stderr: "" }, null]
        const { processRunner, run } = await runAdapter(target, [success])
        expect(run.ran).toBe(true)
        expect(run.diagnostics.some((diagnostic) => diagnostic.code === "FORMAL-QUINT-NO-SOURCES")).toBe(true)
        expect(processRunner.calls).toHaveLength(0)
    })

    test("skips when the tool is missing", async () => {
        const success: Result<CommandResult, CommandFailure> = [{ exitCode: 0, stdout: "", stderr: "" }, null]
        const { processRunner, run } = await runAdapter("/project", [success], null)
        expect(run.ran).toBe(false)
        expect(run.diagnostics).toEqual([])
        expect(processRunner.calls).toHaveLength(0)
    })

    test("forwards command failures", async () => {
        const { target } = await createFormalTarget()
        const spawnFailure: Result<CommandResult, CommandFailure> = [null, { code: "COMMAND_SPAWN_FAILED", message: "not found" }]
        const { run } = await runAdapter(target, [spawnFailure])
        expect(run.diagnostics.some((diagnostic) => diagnostic.code === "COMMAND_SPAWN_FAILED")).toBe(true)
    })

    test("emits skipped-verify warning without manifest", async () => {
        const { target } = await createFormalTarget()
        const success: Result<CommandResult, CommandFailure> = [{ exitCode: 0, stdout: "", stderr: "" }, null]
        const { run } = await runAdapter(target, [success])
        expect(run.diagnostics).toHaveLength(1)
        expect(run.diagnostics[0]?.code).toBe("FORMAL-QUINT-SKIPPED-VERIFY")
        expect(run.diagnostics[0]?.level).toBe("warning")
    })

    test("maps verify failure to a diagnostic", async () => {
        const { target, quintFile, formalDirectory } = await createFormalTarget()
        await writeFile(join(formalDirectory, "quint.json"), JSON.stringify({ maxSteps: 5, invariants: { "example.qnt": ["noNegative"] } }))
        const typecheckSuccess: Result<CommandResult, CommandFailure> = [{ exitCode: 0, stdout: "", stderr: "" }, null]
        const verifyFailure: Result<CommandResult, CommandFailure> = [{ exitCode: 1, stdout: "", stderr: "invariant violated" }, null]
        const { processRunner, run } = await runAdapter(target, [typecheckSuccess, verifyFailure])
        expect(run.diagnostics.some((diagnostic) => diagnostic.code === "FORMAL-QUINT-VERIFY")).toBe(true)
        expect(run.diagnostics.find((diagnostic) => diagnostic.code === "FORMAL-QUINT-VERIFY")?.file).toBe(quintFile)
        expect(processRunner.calls[1]?.arguments).toContain("verify")
    })

    test("reports missing java backend", async () => {
        const { target, formalDirectory } = await createFormalTarget()
        await writeFile(join(formalDirectory, "quint.json"), JSON.stringify({ maxSteps: 5, invariants: { "example.qnt": ["noNegative"] } }))
        const success: Result<CommandResult, CommandFailure> = [{ exitCode: 0, stdout: "", stderr: "" }, null]
        const { processRunner, run } = await runAdapter(target, [success], "/bin/quint", null)
        expect(run.diagnostics.some((diagnostic) => diagnostic.code === "FORMAL-QUINT-MISSING-BACKEND")).toBe(true)
        expect(processRunner.calls).toHaveLength(1)
    })
})
