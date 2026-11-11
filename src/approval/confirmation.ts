import { createInterface } from "node:readline/promises"
import { attemptAsync } from "../core/result"

export interface ApprovalConfirmation {
  confirm(message: string): Promise<boolean>
}

export class TerminalApprovalConfirmation implements ApprovalConfirmation {
  async confirm(message: string): Promise<boolean> {
    const [answer, askError] = await attemptAsync(async () => {
      const readline = createInterface({ input: process.stdin, output: process.stdout })
      const value = await readline.question(message)
      readline.close()

      return value
    })
    if (askError || answer === null) return false

    return /^y(es)?$/i.test(answer.trim())
  }
}
