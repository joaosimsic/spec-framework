import type { DisplayEntry } from "../model"
import { fail, ok, type Result } from "../core/result"
import type { TerminalPrompt } from "./prompt"

export class TerminalEntrySelect {
  constructor(private readonly prompt: TerminalPrompt) {}

  async required(
    message: string,
    entries: DisplayEntry[],
    kinds?: string[],
  ): Promise<Result<string | null, string>> {
    const matches = this.matches(entries, kinds)
    if (matches.length === 0) return fail("no matching items are available")

    return ok(await this.prompt.select(message, this.choices(matches)))
  }

  async optional(
    message: string,
    entries: DisplayEntry[],
    kinds?: string[],
  ): Promise<Result<string | null, string>> {
    const matches = this.matches(entries, kinds)
    const choices = [{ value: "", label: "None" }, ...this.choices(matches)]

    return ok(await this.prompt.select(message, choices))
  }

  private matches(entries: DisplayEntry[], kinds?: string[]): DisplayEntry[] {
    if (kinds === undefined) return entries

    return entries.filter((entry) => kinds.includes(entry.technical.kind))
  }

  private choices(
    entries: DisplayEntry[],
  ): Array<{ value: string; label: string; context: string }> {
    return entries.map((entry) => ({
      value: entry.ref,
      label: entry.label,
      context: entry.kindLabel,
    }))
  }
}
