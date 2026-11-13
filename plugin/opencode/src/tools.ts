import {
  formatAnalyze,
  formatCheck,
  formatContext,
  formatQuery,
  formatStatus,
  redactInternalIds,
  SpecPluginService,
  type PluginFailure,
  type PluginWorkbenchRegistry,
} from "@spec-framework/cli/plugin"
import { tool, type ToolDefinition } from "./compat"

export interface SpecToolDependencies {
  service(target: string): SpecPluginService
  workbench: PluginWorkbenchRegistry
}

export function specTools(dependencies: SpecToolDependencies): Record<string, ToolDefinition> {
  const service = (directory: string) => dependencies.service(directory)

  return {
    spec_status: tool({
      description:
        "Show generated project, snapshot, architecture, flow, finding, and unknown counts.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).status()
        if (error !== null || view === null) return failure(error)
        return { output: formatStatus(view) }
      },
    }),

    spec_context: tool({
      description: "Return bounded generated-spec context.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).context()
        if (error !== null || view === null) return failure(error)
        return { output: formatContext(view) }
      },
    }),

    spec_query: tool({
      description: "Query generated architecture elements by name, id, or kind.",
      args: {
        name: tool.schema.string().optional().describe("Element label"),
        ref: tool.schema.string().optional().describe("Generated element id"),
        kind: tool.schema.string().optional().describe("Element kind"),
      },
      async execute(args, context) {
        const [view, error] = await service(context.directory).query(args)
        if (error !== null || view === null) return failure(error)
        return { output: formatQuery(view) }
      },
    }),

    spec_flows: tool({
      description: "List generated static flows.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).flows()
        if (error !== null || view === null) return failure(error)
        return { output: JSON.stringify(view, null, 2) }
      },
    }),

    spec_findings: tool({
      description: "List generated architectural findings.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).findings()
        if (error !== null || view === null) return failure(error)
        return { output: JSON.stringify(view, null, 2) }
      },
    }),

    spec_snapshots: tool({
      description: "List generated analysis snapshots.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).snapshots()
        if (error !== null || view === null) return failure(error)
        return { output: JSON.stringify(view, null, 2) }
      },
    }),

    spec_validate: tool({
      description: "Validate generated spec schema and references.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).validate()
        if (error !== null || view === null) return failure(error)
        return { output: formatCheck(view) }
      },
    }),

    spec_analyze: tool({
      description: "Start a generated analysis job for the current project.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).analyze()
        if (error !== null || view === null) return failure(error)
        return { output: formatAnalyze(view) }
      },
    }),

    spec_workbench: tool({
      description: "Start the generated System workbench and return its URL.",
      args: {},
      async execute(_args, context) {
        const [url, openError] = await dependencies.workbench.open(context.directory)
        if (openError !== null || url === null) {
          return { title: "Workbench unavailable", output: openError ?? "workbench did not start" }
        }
        return { title: "Workbench open", output: `workbench: ${url}\ninitial view: System` }
      },
    }),
  }
}

function failure(error: PluginFailure | null): {
  title: string
  output: string
  metadata: { code: string }
} {
  return {
    title: "Spec request failed",
    output: redactInternalIds(error?.message ?? "The request did not return a result."),
    metadata: { code: error?.code ?? "SPEC-PLUGIN-UNKNOWN" },
  }
}
