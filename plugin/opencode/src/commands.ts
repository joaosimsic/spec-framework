import type { Config } from "./compat"

type Commands = NonNullable<Config["command"]>

const common = [
  "Use visible names. Do not print internal codes unless the human asks for technical details.",
  "Never approve. Approval is a human-only CLI action.",
  "Record accepted decisions with spec_decide before ending the turn.",
].join(" ")

export function pluginCommands(): Commands {
  return {
    "spec-start": {
      description: "Start a scratch-mode specification conversation",
      template: [
        "Start a scratch-mode specification conversation for: $ARGUMENTS",
        "Call spec_status and spec_context first. If no proposal is open, explain the setup step and ask the human to open a scratch proposal from the CLI.",
        "Interview the human about users, scope, non-goals, constraints, quality attributes, failures, and operations.",
        common,
      ].join("\n\n"),
    },
    "spec-map": {
      description: "Review or curate a code-derived architecture map",
      template: [
        "Review the current architecture map for: $ARGUMENTS",
        "Call spec_status, spec_context, and spec_query. Explain areas and relations by name, show confidence in plain language, and ask one contextual question at a time.",
        "Use spec_workbench for interactive curation.",
        common,
      ].join("\n\n"),
    },
    "spec-change": {
      description: "Draft a typed change proposal",
      template: [
        "Draft a change proposal for: $ARGUMENTS",
        "Call spec_status and spec_context. Use spec_propose with typed operations only. Show the named impact and invalidated approvals before proposing more work.",
        common,
      ].join("\n\n"),
    },
    "spec-refactor": {
      description: "Plan a refactor against an approved baseline",
      template: [
        "Plan a refactor for: $ARGUMENTS",
        "Call spec_status and spec_context. If no approved baseline exists, say so plainly. Use spec_diff, spec_impact, and spec_validate before and after spec_propose.",
        common,
      ].join("\n\n"),
    },
    "spec-review": {
      description: "Review the active proposal",
      template: [
        "Review the active proposal.",
        "Call spec_status, spec_diff, spec_impact, and spec_validate. Lead with the human summary and affected names. List invalidated approvals and blocking open questions.",
        common,
      ].join("\n\n"),
    },
    "spec-workbench": {
      description: "Open the local proposal workbench",
      template: [
        "Open the local proposal workbench focused on: $ARGUMENTS",
        "Call spec_workbench and return the local URL. Do not approve from the workbench.",
      ].join("\n\n"),
    },
    "spec-status": {
      description: "Show the current specification mode and next actions",
      template: [
        "Show the current specification status.",
        "Call spec_status and spec_next. Summarize mode, proposal, blockers, open questions, and next actions by name.",
        common,
      ].join("\n\n"),
    },
  }
}
