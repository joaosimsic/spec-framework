import type { Config, Hooks, Plugin, PluginInput, ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"

export { tool }
export type { Config, Hooks, Plugin, PluginInput, ToolDefinition }

export type SpecPluginDefinition = (
  input: PluginInput,
  options?: Record<string, unknown>,
) => Promise<Hooks>
