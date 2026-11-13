import { join } from "node:path"
import {
  fail,
  formatContextBlock,
  guardCommand,
  guardWrite,
  ok,
  PluginWorkbenchRegistry,
  SpecPluginService,
  type Result,
} from "@spec-framework/cli/plugin"
import type { Config, Hooks, Plugin, PluginInput } from "./compat"
import { pluginAgents } from "./agents"
import { pluginCommands } from "./commands"
import { specTools } from "./tools"

export type * from "./compat"

export function createSpecPlugin(
  input: PluginInput,
  _options?: Record<string, unknown>,
): Promise<Hooks> {
  const services = new Map<string, SpecPluginService>()
  const workbench = new PluginWorkbenchRegistry()
  const contextCache = new Map<string, { at: number; block: string }>()

  const serviceFor = (target: string): SpecPluginService => {
    const existing = services.get(target)
    if (existing !== undefined) return existing
    const created = new SpecPluginService(target)
    services.set(target, created)
    return created
  }

  const contextBlock = async (target: string): Promise<string | null> => {
    const cached = contextCache.get(target)
    if (cached !== undefined && Date.now() - cached.at < 5000) return cached.block
    const [found] = await fileExists(join(target, ".spec", "analysis.sqlite"))
    if (!found) return null
    const [status, error] = await serviceFor(target).status()
    if (error !== null || status === null) return null
    const block = formatContextBlock(status)
    contextCache.set(target, { at: Date.now(), block })
    return block
  }

  const hooks: Hooks = {
    config: async (config: Config) => {
      config.command = { ...pluginCommands(), ...(config.command ?? {}) }
      config.agent = { ...pluginAgents(), ...(config.agent ?? {}) }
      const extended = config as Config & { skills?: { paths?: string[] } }
      const skills = extended.skills ?? {}
      const skillsPath = join(import.meta.dir, "..", "skills")
      extended.skills = { ...skills, paths: [...new Set([...(skills.paths ?? []), skillsPath])] }
    },
    tool: specTools({ service: serviceFor, workbench }),
    "experimental.chat.system.transform": async (_message, output) => {
      const block = await contextBlock(input.directory)
      if (block !== null) output.system.push(block)
    },
    "tool.execute.before": async (event, output) => {
      if (event.tool === "bash") {
        const command = typeof output.args?.command === "string" ? output.args.command : ""
        const failure = guardCommand(command)
        if (failure !== null) throw new Error(failure)
      }
      if (event.tool === "edit" || event.tool === "write" || event.tool === "patch") {
        const path = writePath(output.args)
        if (path !== null) {
          const failure = guardWrite(path)
          if (failure !== null) throw new Error(failure)
        }
      }
    },
    dispose: async () => {
      services.clear()
      contextCache.clear()
      await workbench.dispose()
    },
  }

  return Promise.resolve(hooks)
}

async function fileExists(path: string): Promise<Result<boolean, string>> {
  try {
    return ok(await Bun.file(path).exists())
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

function writePath(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null
  const record = args as Record<string, unknown>
  for (const key of ["filePath", "path", "file", "filename"]) {
    const value = record[key]
    if (typeof value === "string" && value !== "") return value
  }

  return null
}

const plugin: Plugin = createSpecPlugin
export default plugin
export type { Plugin }
