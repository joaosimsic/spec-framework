import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SpecFrameworkConfigLoader } from "../src/config"

describe("spec-framework config", () => {
  test("uses defaults when config is absent", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-config-"))
    const [config, error] = await new SpecFrameworkConfigLoader(target).load()
    expect(error).toBeNull()
    expect(config?.analysis.roots).toEqual(["."])
    expect(config?.checks).toEqual([])
  })

  test("reads root configuration", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-config-"))
    await writeFile(
      join(target, "spec-framework.json"),
      JSON.stringify({
        version: 1,
        project: { name: "sample" },
        analysis: { roots: ["."], exclude: ["dist"], flow_analysis: false },
        diagnostics: { "ARC-002": { threshold: 3 } },
        checks: [{ id: "typecheck", kind: "typecheck", command: ["bun", "run", "typecheck"] }],
      }),
    )
    const [config, error] = await new SpecFrameworkConfigLoader(target).load()
    expect(error).toBeNull()
    expect(config?.project.name).toBe("sample")
    expect(config?.analysis.flowAnalysis).toBe(false)
    expect(config?.checks[0]?.id).toBe("typecheck")
  })
})
