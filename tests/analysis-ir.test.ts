import { describe, expect, test } from "bun:test"
import { IR_VERSION, IrIdentity, type IrSnapshot } from "../src/analysis/ir"
import { IrValidator } from "../src/analysis/ir-validator"

describe("analysis IR", () => {
  test("keeps identity independent of line numbers", () => {
    expect(IrIdentity.symbol("src/orders.ts", "Orders.submit")).toBe(
      "SYM-src/orders.ts#Orders.submit",
    )
    expect(IrIdentity.file("src/orders.ts")).toBe("FILE-src/orders.ts")
    expect(IrIdentity.entry("cli", "bin/spec.ts")).toBe("ENTRY-cli-bin/spec.ts")
  })

  test("rejects relationships and parents that do not exist", () => {
    const snapshot: IrSnapshot = {
      version: IR_VERSION,
      elements: [
        {
          id: "SYM-a",
          type: "function",
          language: "typescript",
          name: "a",
          qualifiedName: "a",
          filePath: "src/a.ts",
          startLine: 1,
          endLine: 1,
          parentId: "FILE-missing",
          signature: "function a()",
          visibility: "public",
          exported: true,
          references: [],
          calls: [],
          imports: [],
          inheritance: [],
          dataAccess: [],
          confidence: "observed",
          provenance: "test",
        },
      ],
      relationships: [],
      entryPoints: [],
      findings: [],
    }
    const [validated, validationError] = IrValidator.validate(snapshot)
    expect(validated).toBeNull()
    expect(validationError).toContain("parent")
  })
})
