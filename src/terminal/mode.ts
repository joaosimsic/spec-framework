export interface TerminalModeOptions {
  interactive?: boolean
  json: boolean
  scripted: boolean
  stdinIsTTY?: boolean
  stdoutIsTTY?: boolean
}

export class TerminalMode {
  static resolve(options: TerminalModeOptions): boolean {
    if (options.interactive !== undefined) return options.interactive
    if (options.json || options.scripted) return false

    const stdinIsTTY = options.stdinIsTTY ?? process.stdin.isTTY === true
    const stdoutIsTTY = options.stdoutIsTTY ?? process.stdout.isTTY === true

    return stdinIsTTY && stdoutIsTTY
  }
}
