import type { TerminalIO } from "./io"

export interface TerminalChoice {
  value: string
  label: string
  context?: string
}

export class TerminalPrompt {
  private closed = false

  constructor(private readonly io: TerminalIO) {}

  get isClosed(): boolean {
    return this.closed
  }

  async text(message: string): Promise<string | null> {
    const answer = await this.io.ask(`${message}: `)
    if (answer === null) {
      this.closed = true

      return null
    }

    return answer.trim()
  }

  async required(message: string): Promise<string | null> {
    while (true) {
      const answer = await this.text(message)
      if (answer === null) return null
      if (answer !== "") return answer
      this.io.print("A value is required.")
    }
  }

  async lines(message: string): Promise<string[] | null> {
    const lines: string[] = []
    while (true) {
      const line = await this.text(`${message} (blank to finish)`)
      if (line === null) return null
      if (line === "") return lines

      lines.push(line)
    }
  }

  async select(message: string, choices: TerminalChoice[]): Promise<string | null> {
    this.io.print(message)
    choices.forEach((choice, index) => {
      const context = choice.context === undefined ? "" : ` - ${choice.context}`
      this.io.print(`  ${index + 1}. ${choice.label}${context}`)
    })

    while (true) {
      const answer = await this.text("Choose a number or name")
      if (answer === null) return null

      const index = Number(answer)
      if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
        return choices[index - 1]?.value ?? null
      }

      const matches = choices.filter(
        (choice) => choice.label.toLowerCase() === answer.toLowerCase(),
      )
      if (matches.length === 1) return matches[0]?.value ?? null
      if (matches.length > 1) {
        this.io.print("That name is ambiguous. Choose a number.")
        continue
      }

      this.io.print("Unknown choice. Try again.")
    }
  }

  async confirm(message: string): Promise<boolean | null> {
    while (true) {
      const answer = await this.text(`${message} [y/N]`)
      if (answer === null) return null
      if (/^y(es)?$/i.test(answer)) return true
      if (answer === "" || /^n(o)?$/i.test(answer)) return false
      this.io.print("Answer yes or no.")
    }
  }
}
