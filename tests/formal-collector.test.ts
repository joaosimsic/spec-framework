import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FormalGraphSource, loadFormalSources, SpecGraphBuilder } from "../src/model"
import type { GraphWorkspace, SpecGraph } from "../src/model/types"

const workspace: GraphWorkspace = {
  workspace: "single-repo",
  commit: "a1b2c3d",
  dirty: false,
}

async function buildFormal(source: string): Promise<SpecGraph> {
  const target = await mkdtemp(join(tmpdir(), "formal-"))
  try {
    const formalDirectory = join(target, "spec", "formal")
    await mkdir(formalDirectory, { recursive: true })
    await writeFile(join(formalDirectory, "model.qnt"), source)

    const sources = await loadFormalSources(target)
    const builder = new SpecGraphBuilder()
    builder.add(new FormalGraphSource().collect(sources))
    const [graph, error] = builder.build(workspace)
    expect(error).toBeNull()
    if (graph === null) throw new Error("graph build returned null")

    return graph
  } finally {
    await rm(target, { recursive: true, force: true })
  }
}

describe("FormalGraphSource", () => {
  test("emits annotated modules, properties, and invariants", async () => {
    const graph = await buildFormal(`// MOD-SAMPLE
module sample {
  // PROP-SAMPLE-NO-NEGATIVE
  val noNegative = count >= 0
  // INV-SAMPLE-BOUNDED
  invariant bounded = count < 10
}
`)

    expect(graph.elements.map((element) => element.id)).toEqual([
      "INV-SAMPLE-BOUNDED",
      "MOD-SAMPLE",
      "PROP-SAMPLE-NO-NEGATIVE",
    ])
    expect(graph.elements.find((element) => element.id === "MOD-SAMPLE")).toMatchObject({
      kind: "formal_module",
      title: "sample",
      provenance: "doc:spec/formal/model.qnt#sample",
      links: [],
    })
    expect(
      graph.elements.find((element) => element.id === "PROP-SAMPLE-NO-NEGATIVE"),
    ).toMatchObject({
      kind: "formal_property",
      title: "noNegative",
      provenance: "doc:spec/formal/model.qnt#sample.noNegative",
      links: [{ type: "part_of", to: "MOD-SAMPLE" }],
    })
    expect(graph.elements.find((element) => element.id === "INV-SAMPLE-BOUNDED")?.kind).toBe(
      "invariant",
    )
    expect(graph.findings).toEqual([])
  })

  test("is deterministic for the same source", async () => {
    const source = `// MOD-SAMPLE
module sample {
  // PROP-SAMPLE-001
  val sample = true
}
`
    const first = await buildFormal(source)
    const second = await buildFormal(source)

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  test("reports unannotated modules and declarations instead of guessing IDs", async () => {
    const graph = await buildFormal(`module sample {
  val unannotated = true
}
`)

    expect(graph.elements).toEqual([])
    expect(graph.findings.map((finding) => finding.code)).toEqual([
      "FORMAL-UNANNOTATED",
      "FORMAL-UNANNOTATED",
    ])
    expect(graph.findings[0]?.message).toContain("module 'sample'")
    expect(graph.findings[1]?.message).toContain("val 'unannotated'")
  })

  test("reports duplicate formal IDs", async () => {
    const graph = await buildFormal(`// MOD-SAMPLE
module first {
}

// MOD-SAMPLE
module second {
}
`)

    expect(graph.elements.map((element) => element.id)).toEqual(["MOD-SAMPLE"])
    expect(graph.findings).toEqual([
      {
        level: "warning",
        code: "FORMAL-DUPLICATE-ID",
        message: "duplicate formal element 'MOD-SAMPLE'",
        id: "MOD-SAMPLE",
      },
    ])
  })

  test("reports annotations with the wrong ID prefix", async () => {
    const graph = await buildFormal(`// CMP-SAMPLE
module sample {
}
`)

    expect(graph.elements).toEqual([])
    expect(graph.findings[0]?.code).toBe("FORMAL-INVALID-ID")
    expect(graph.findings[0]?.message).toContain("must use MOD-")
  })
})
