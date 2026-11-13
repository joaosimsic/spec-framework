import { homedir } from "node:os"
import { join } from "node:path"
import { attempt, attemptAsync, fail, ok, type Result } from "../core/result"
import type { AiConfig } from "./types"

const DEFAULT_CONFIG: AiConfig = {
  mode: "local",
  endpoint: "http://127.0.0.1:11434/v1/chat/completions",
  model: "local-model",
  apiKeyEnvironment: null,
  promptVersion: "1",
}

export class AiConfigLoader {
  constructor(private readonly environment: Record<string, string | undefined> = process.env) {}

  defaultPath(): string {
    const base = this.environment["XDG_CONFIG_HOME"] ?? join(homedir(), ".config")
    return join(base, "spec-framework", "ai.json")
  }

  async load(): Promise<Result<AiConfig, string>> {
    const path = this.environment["SPEC_AI_CONFIG"] ?? this.defaultPath()
    const [text, readError] = await attemptAsync(async () => {
      const file = Bun.file(path)
      return (await file.exists()) ? file.text() : ""
    })
    if (readError !== null || text === null) return fail(readError ?? "cannot read AI config")
    if (text === "") return ok(DEFAULT_CONFIG)

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) return fail(parseError ?? "invalid AI config")
    if (typeof parsed !== "object" || Array.isArray(parsed))
      return fail("AI config must be an object")
    const record = parsed as Record<string, unknown>
    const mode = record["mode"]
    if (mode !== "local" && mode !== "remote") return fail("AI config mode must be local or remote")
    if (record["remoteOptIn"] === true || mode === "remote") {
      if (mode !== "remote") return fail("remote AI requires explicit remote mode")
    }
    if (typeof record["endpoint"] !== "string" || !record["endpoint"].startsWith("http")) {
      return fail("AI config endpoint must be an HTTP endpoint")
    }
    if (typeof record["model"] !== "string" || record["model"].trim() === "") {
      return fail("AI config model must be a non-empty string")
    }

    return ok({
      mode,
      endpoint: record["endpoint"],
      model: record["model"],
      apiKeyEnvironment:
        typeof record["apiKeyEnvironment"] === "string" ? record["apiKeyEnvironment"] : null,
      promptVersion: typeof record["promptVersion"] === "string" ? record["promptVersion"] : "1",
    })
  }
}
