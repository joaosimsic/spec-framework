import { createInterface } from "node:readline/promises"
import { attemptAsync } from "../core/result"

export interface TerminalIO {
  ask(message: string): Promise<string | null>
  print(message: string): void
  close(): void
}

export class ReadlineTerminalIO implements TerminalIO {
  private readline: ReturnType<typeof createInterface> | null = null

  async ask(message: string): Promise<string | null> {
    const [answer, error] = await attemptAsync(() => this.reader().question(message))
    if (error !== null || answer === null) return null

    return answer
  }

  print(message: string): void {
    console.log(message)
  }

  close(): void {
    this.readline?.close()
    this.readline = null
  }

  private reader(): ReturnType<typeof createInterface> {
    this.readline ??= createInterface({ input: process.stdin, output: process.stdout })

    return this.readline
  }
}
