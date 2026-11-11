import type { ScratchBriefing } from "./start"
import { ChangeReportRenderer } from "./report"
import type { ChangeReport } from "./types"

export class StartReportRenderer {
  static human(briefing: ScratchBriefing): string {
    return [
      "scratch proposal open",
      `goal: ${briefing.direction}`,
      `state: ${briefing.state}`,
      "nothing is approved",
      "",
      "interview prompts:",
      ...briefing.prompts.map((prompt) => `- ${prompt}`),
      "",
      "next:",
      ...briefing.next.map((step) => `- ${step}`),
    ].join("\n")
  }

  static technical(briefing: ScratchBriefing, change: ChangeReport): string {
    return [
      `start: mode=scratch state=${briefing.state}`,
      `start-goal: ${briefing.direction}`,
      ...briefing.prompts.map((prompt) => `start-prompt: ${prompt}`),
      ...briefing.next.map((step) => `start-next: ${step}`),
      "",
      ChangeReportRenderer.technical(change),
    ].join("\n")
  }
}
