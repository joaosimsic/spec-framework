import ts from "typescript"
import type { DataChannel, IrDataAccess } from "../../ir"

const CHANNEL_PATTERNS: Array<[DataChannel, "read" | "write", RegExp]> = [
  [
    "filesystem",
    "write",
    /\b(?:Bun\.write|writeFile|writeFileSync|appendFile|appendFileSync|mkdir|rm|unlink)\b/,
  ],
  [
    "filesystem",
    "read",
    /\b(?:Bun\.file|readFile|readFileSync|readdir|readdirSync|stat|statSync|existsSync)\b/,
  ],
  ["network", "write", /\b(?:fetch|axios|got|WebSocket|Bun\.serve|https?\.request)\b/],
  ["environment", "read", /\b(?:process\.env|Bun\.env)\b/],
  ["database", "read", /\b(?:Database|sqlite|\.query|\.prepare|\.exec)\b/],
  ["queue", "write", /\b(?:publish|enqueue|\.send)\b/],
  ["queue", "read", /\b(?:consume|subscribe|\.receive)\b/],
  [
    "standard_stream",
    "write",
    /\b(?:console\.(?:log|error|warn|info)|process\.(?:stdout|stderr))\b/,
  ],
  ["external", "write", /\b(?:child_process|spawn|execSync|spawnSync)\b/],
]

export class DataAccessClassifier {
  static classify(node: ts.Node, sourceFile: ts.SourceFile): IrDataAccess[] {
    if (!ts.isCallExpression(node) && !ts.isPropertyAccessExpression(node)) return []
    const text = node.getText(sourceFile)
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    const accesses: IrDataAccess[] = []

    for (const [channel, kind, pattern] of CHANNEL_PATTERNS) {
      if (!pattern.test(text)) continue
      accesses.push({ kind, channel, source: text.slice(0, 160), line })
    }

    return accesses
  }
}
