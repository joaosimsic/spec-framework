import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { IrEntryPoint } from "../src/analysis/ir"
import type { SpecFrameworkConfig } from "../src/config"
import { GeneratedRecordFactory } from "../src/generation/records"

function entry(
  id: string,
  kind: IrEntryPoint["kind"],
  label: string,
  metadata: Record<string, string> = {},
): IrEntryPoint {
  return {
    id,
    nodeId: `FILE-${metadata["path"] ?? "src/index.ts"}`,
    kind,
    label,
    provenance: `typescript:${metadata["path"] ?? "src/index.ts"}:1`,
    confidence: "observed",
    metadata,
  }
}

const config = {
  version: 1,
  project: { name: "sample" },
  analysis: {
    roots: ["."],
    exclude: [],
    entryPoints: { include: [], exclude: [] },
    flowAnalysis: true,
  },
  diagnostics: {},
  checks: [],
  ai: null,
} satisfies SpecFrameworkConfig

describe("generated contracts", () => {
  test("groups HTTP routes and records CLI and JSON Schema surfaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "contracts-"))
    await mkdir(join(root, "schemas"), { recursive: true })
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "sample", exports: { ".": "./src/index.ts" } }),
    )
    await writeFile(
      join(root, "schemas", "order.schema.json"),
      JSON.stringify({
        $id: "https://example.test/order.schema.json",
        title: "Order",
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
      }),
    )
    const entries = [
      entry("ENTRY-http-orders", "http_route", "GET /orders", {
        method: "GET",
        route: "/orders",
        path: "src/http.ts",
      }),
      entry("ENTRY-http-order", "http_route", "GET /orders/:id", {
        method: "GET",
        route: "/orders/:id",
        path: "src/http.ts",
      }),
      entry("ENTRY-cli-spec", "cli", "spec", { path: "src/cli.ts", name: "spec" }),
    ]
    const contracts = await new GeneratedRecordFactory(root, config).contracts([], entries, [
      { path: "schemas/order.schema.json" },
    ])

    const routes = contracts.records.find((record) => record.kind === "http_routes")
    expect(routes?.surface).toEqual(["GET /orders", "GET /orders/:id"])
    expect(routes?.confidence).toBe("inferred")
    expect(contracts.records.find((record) => record.kind === "cli")?.surface).toEqual(["spec"])
    const schema = contracts.records.find((record) => record.kind === "json_schema")
    expect(schema?.surface).toContain("Order")
    expect(schema?.surface).toContain("https://example.test/order.schema.json")
    expect(schema?.owner).toBe("schemas/order.schema.json")
    expect(contracts.evidence.every((item) => item.id !== "")).toBe(true)
  })

  test("does not duplicate CLI contracts when package bin already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "contracts-bin-"))
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "sample", bin: { spec: "./bin/spec.ts" } }),
    )
    const contracts = await new GeneratedRecordFactory(root, config).contracts(
      [],
      [entry("ENTRY-cli-spec", "cli", "spec", { path: "bin/spec.ts", name: "spec" })],
      [],
    )

    const cli = contracts.records.filter((record) => record.kind === "cli")
    expect(cli).toHaveLength(1)
    expect(cli[0]?.id.startsWith("CON-")).toBe(true)
    expect(cli[0]?.surface).toContain("spec:./bin/spec.ts")
  })
})
