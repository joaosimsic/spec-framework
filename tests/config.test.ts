import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SpecConfigLoader } from "../src/core/config"

const validConfig = {
  version: 1,
  profile: "full",
  project: {
    name: "sample",
    adoption: "existing",
  },
  adapters: {
    architecture: "likec4",
    requirements: "strictdoc",
    formal: "quint",
    contracts: ["json-schema"],
  },
  approval: {
    mode: "hash-lock",
    humanOnly: true,
  },
}

describe("SpecConfigLoader", () => {
  test("loads a valid config", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(target, "spec"), { recursive: true })
      await writeFile(join(target, "spec", "config.json"), JSON.stringify(validConfig))

      const [config, error] = await new SpecConfigLoader(target).load()

      expect(error).toBeNull()
      expect(config?.adapters.architecture).toBe("likec4")
      expect(config?.approval.humanOnly).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a missing config", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const [config, error] = await new SpecConfigLoader(target).load()

      expect(config).toBeNull()
      expect(error?.code).toBe("SPEC-NO-CONFIG")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects malformed JSON", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(target, "spec"), { recursive: true })
      await writeFile(join(target, "spec", "config.json"), "{")

      const [config, error] = await new SpecConfigLoader(target).load()

      expect(config).toBeNull()
      expect(error?.code).toBe("SPEC-BAD-CONFIG")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects missing required fields", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(target, "spec"), { recursive: true })
      await writeFile(
        join(target, "spec", "config.json"),
        JSON.stringify({ version: 1, profile: "full" }),
      )

      const [config, error] = await new SpecConfigLoader(target).load()

      expect(config).toBeNull()
      expect(error?.code).toBe("SPEC-BAD-CONFIG")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("requires an architecture adapter", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(target, "spec"), { recursive: true })
      await writeFile(
        join(target, "spec", "config.json"),
        JSON.stringify({
          ...validConfig,
          adapters: {
            requirements: "strictdoc",
          },
        }),
      )

      const [config, error] = await new SpecConfigLoader(target).load()

      expect(config).toBeNull()
      expect(error?.code).toBe("SPEC-BAD-CONFIG")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
