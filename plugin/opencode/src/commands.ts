import type { Config } from "./compat"

type Commands = NonNullable<Config["command"]>

export function pluginCommands(): Commands {
  return {
    "spec-analyze": {
      description: "Analyze the repository into a generated snapshot",
      template: [
        "Analyze this repository for: $ARGUMENTS",
        "Call spec_analyze. Then call spec_status and summarize generated architecture, flows, findings, and unknowns.",
      ].join("\n\n"),
    },
    "spec-status": {
      description: "Show generated snapshot status",
      template: ["Show generated spec status.", "Call spec_status."].join("\n\n"),
    },
    "spec-review": {
      description: "Review generated architecture and findings",
      template: [
        "Review generated repository evidence.",
        "Call spec_status, spec_context, spec_findings, and spec_validate. Cite evidence and confidence.",
      ].join("\n\n"),
    },
    "spec-workbench": {
      description: "Open the generated System workbench",
      template: ["Open the generated System workbench.", "Call spec_workbench."].join("\n\n"),
    },
  }
}
