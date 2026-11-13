import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JsonSchemaAdapter } from "../src/adapters/json-schema"
import type { AdapterRun } from "../src/adapters/types"
import { ok, type Result } from "../src/core/result"
import type { CommandFailure, CommandResult, ProcessRunner, ToolLocator } from "../src/core/runner"

const validSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Example",
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
  additionalProperties: false,
}

const validSidecar = {
  id: "CON-EXAMPLE-001",
  owner: "spec-framework",
  consumers: ["spec-cli"],
  compatibility: "backward",
  schema: "example.schema.json",
}

const stubRunner: ProcessRunner = {
  async run(): Promise<Result<CommandResult, CommandFailure>> {
    return ok({ exitCode: 0, stdout: "", stderr: "" })
  },
}
const stubLocator: ToolLocator = {
  async resolve() {
    return null
  },
}

async function createContractsTarget(): Promise<{ target: string; contractsDirectory: string }> {
  const target = await mkdtemp(join(tmpdir(), "json-schema-"))
  const contractsDirectory = join(target, "spec", "contracts")
  await mkdir(contractsDirectory, { recursive: true })
  return { target, contractsDirectory }
}

async function writeSchemaFile(
  contractsDirectory: string,
  fileName: string,
  text: string,
): Promise<string> {
  const schemaPath = join(contractsDirectory, fileName)
  await writeFile(schemaPath, text)
  return schemaPath
}

async function writeSidecarFile(
  contractsDirectory: string,
  fileName: string,
  sidecar: unknown,
): Promise<string> {
  const sidecarPath = join(contractsDirectory, fileName)
  await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2))
  return sidecarPath
}

async function writeBaselineFile(
  target: string,
  contractBaseName: string,
  hash: string,
): Promise<void> {
  const baselinesDirectory = join(target, "spec", "contracts", ".baselines")
  await mkdir(baselinesDirectory, { recursive: true })
  await writeFile(join(baselinesDirectory, `${contractBaseName}.sha256`), `${hash}\n`)
}

async function runAdapter(target: string): Promise<AdapterRun> {
  return new JsonSchemaAdapter().run({
    target,
    processRunner: stubRunner,
    toolLocator: stubLocator,
  })
}

describe("JsonSchemaAdapter", () => {
  test("approves valid schema with sidecar and matching baseline", async () => {
    const { target, contractsDirectory } = await createContractsTarget()
    const schemaText = JSON.stringify(validSchema, null, 2)
    await writeSchemaFile(contractsDirectory, "example.schema.json", schemaText)
    await writeSidecarFile(contractsDirectory, "example.contract.json", validSidecar)
    await writeBaselineFile(
      target,
      "example",
      createHash("sha256").update(schemaText, "utf8").digest("hex"),
    )
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toEqual([])
    expect(run.evidence?.[0]?.id).toBe("EVD-CON-EXAMPLE-001")
    expect(run.evidence?.[0]?.result).toBe("pass")
    expect(run.evidence?.[0]?.inputs).toHaveLength(3)
  })

  test("rejects schema that fails ajv meta-validation", async () => {
    const { target, contractsDirectory } = await createContractsTarget()
    const schemaPath = await writeSchemaFile(
      contractsDirectory,
      "example.schema.json",
      JSON.stringify({ type: "nonsense-type" }),
    )
    await writeSidecarFile(contractsDirectory, "example.contract.json", validSidecar)
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-JSONSCHEMA")
    expect(run.diagnostics[0]?.file).toBe(schemaPath)
  })

  test("rejects malformed schema json", async () => {
    const { target, contractsDirectory } = await createContractsTarget()
    const schemaPath = await writeSchemaFile(contractsDirectory, "example.schema.json", `{"type": `)
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-JSONSCHEMA")
    expect(run.diagnostics[0]?.file).toBe(schemaPath)
  })

  test("rejects schema with missing sidecar", async () => {
    const { target, contractsDirectory } = await createContractsTarget()
    await writeSchemaFile(
      contractsDirectory,
      "example.schema.json",
      JSON.stringify(validSchema, null, 2),
    )
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-JSONSCHEMA-POLICY")
    expect(run.diagnostics[0]?.file).toBe(join(contractsDirectory, "example.contract.json"))
  })

  test("rejects sidecar without compatibility", async () => {
    const { target, contractsDirectory } = await createContractsTarget()
    await writeSchemaFile(
      contractsDirectory,
      "example.schema.json",
      JSON.stringify(validSchema, null, 2),
    )
    const sidecarPath = await writeSidecarFile(contractsDirectory, "example.contract.json", {
      id: "CON-EXAMPLE-001",
      owner: "spec-framework",
      consumers: ["spec-cli"],
      schema: "example.schema.json",
    })
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-JSONSCHEMA-POLICY")
    expect(run.diagnostics[0]?.file).toBe(sidecarPath)
  })

  test("rejects schema with mismatched baseline", async () => {
    const { target, contractsDirectory } = await createContractsTarget()
    const schemaPath = await writeSchemaFile(
      contractsDirectory,
      "example.schema.json",
      JSON.stringify(validSchema, null, 2),
    )
    await writeSidecarFile(contractsDirectory, "example.contract.json", validSidecar)
    await writeBaselineFile(target, "example", "0".repeat(64))
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-JSONSCHEMA-CHANGED")
    expect(run.diagnostics[0]?.file).toBe(schemaPath)
  })

  test("warns when baseline is absent", async () => {
    const { target, contractsDirectory } = await createContractsTarget()
    const schemaPath = await writeSchemaFile(
      contractsDirectory,
      "example.schema.json",
      JSON.stringify(validSchema, null, 2),
    )
    await writeSidecarFile(contractsDirectory, "example.contract.json", validSidecar)
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-JSONSCHEMA-NO-BASELINE")
    expect(run.diagnostics[0]?.level).toBe("warning")
    expect(run.diagnostics[0]?.file).toBe(schemaPath)
  })

  test("emits no-sources when contracts dir has no schemas", async () => {
    const { target } = await createContractsTarget()
    const run = await runAdapter(target)
    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-JSONSCHEMA-NO-SOURCES")
  })
})
