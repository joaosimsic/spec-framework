import { join } from "node:path"
import { attemptAsync, type Result, ok, fail } from "../core/result"
import { WorkbenchServer, type WorkbenchServerHandle } from "../workbench"

interface OpenWorkbench {
  handle: WorkbenchServerHandle
}

export class PluginWorkbenchRegistry {
  private readonly servers = new Map<string, Promise<OpenWorkbench>>()

  async open(target: string): Promise<Result<string, string>> {
    const assetPath = join(import.meta.dir, "..", "workbench", "web", "dist", "index.html")
    const [assetReady, assetError] = await attemptAsync(() => Bun.file(assetPath).exists())
    if (assetError !== null) return fail(`cannot read workbench assets: ${assetError}`)
    if (!assetReady) return fail("workbench assets are not built; run bun run build:workbench")

    let pending = this.servers.get(target)
    if (pending === undefined) {
      pending = this.start(target)
      this.servers.set(target, pending)
    }

    const [opened, openError] = await attemptAsync(() => pending)
    if (openError !== null || opened === null) {
      this.servers.delete(target)
      return fail(openError ?? "workbench did not start")
    }

    return ok(opened.handle.url)
  }

  async dispose(): Promise<void> {
    const pending = [...this.servers.values()]
    this.servers.clear()

    for (const server of pending) {
      const [opened] = await attemptAsync(() => server)
      opened?.handle.close()
    }
  }

  private async start(target: string): Promise<OpenWorkbench> {
    const server = new WorkbenchServer({
      target,
      host: "127.0.0.1",
      port: 0,
      logger: { log: () => undefined },
    })
    const [handle, startError] = await server.start()
    if (startError !== null || handle === null) {
      throw new Error(startError ?? "workbench did not start")
    }

    return { handle }
  }
}
