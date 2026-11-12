import { describe, expect, test } from "bun:test"
import createSpecPlugin from "../plugin/opencode/src/index"
import type { Config, PluginInput } from "../plugin/opencode/src/compat"

function pluginInput(directory = process.cwd()): PluginInput {
  return { directory } as unknown as PluginInput
}

describe("opencode plugin", () => {
  test("registers tools, commands, agents, and skills", async () => {
    const hooks = await createSpecPlugin(pluginInput())
    const config: Config = {}
    await hooks.config?.(config)

    expect(Object.keys(hooks.tool ?? {})).toEqual([
      "spec_status",
      "spec_context",
      "spec_query",
      "spec_impact",
      "spec_diff",
      "spec_validate",
      "spec_propose",
      "spec_decide",
      "spec_next",
      "spec_workbench",
    ])
    expect(Object.keys(config.command ?? {})).toContain("spec-start")
    expect(Object.keys(config.agent ?? {})).toEqual([
      "spec-architect",
      "spec-critic",
      "spec-mapper",
    ])
    const extended = config as Config & { skills?: { paths?: string[] } }
    expect(extended.skills?.paths?.length).toBe(1)
  })

  test("guards approval commands and lock writes", async () => {
    const hooks = await createSpecPlugin(pluginInput())
    await hooks["chat.message"]?.(
      { sessionID: "session-1", agent: "spec-architect" },
      { message: {} as never, parts: [] },
    )

    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "bash", sessionID: "session-1", callID: "call-1" },
        { args: { command: "spec approve REQ-SAMPLE-001" } },
      ),
    ).rejects.toThrow("human-only")

    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "write", sessionID: "session-1", callID: "call-2" },
        { args: { filePath: "spec/spec.lock" } },
      ),
    ).rejects.toThrow("human-only")

    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "write", sessionID: "session-1", callID: "call-3" },
        { args: { filePath: "spec/requirements/core.sdoc" } },
      ),
    ).rejects.toThrow("spec_propose")
  })
})
