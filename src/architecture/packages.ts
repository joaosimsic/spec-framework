import { dirname, join } from "node:path"

export class PackageNameLookup {
  private readonly cache = new Map<string, string | null>()

  constructor(private readonly root: string) {}

  async nameFor(filePath: string): Promise<string | null> {
    let directory = dirname(filePath)
    const visited: string[] = []
    while (true) {
      const cached = this.cache.get(directory)
      if (cached !== undefined) {
        for (const item of visited) this.cache.set(item, cached)
        return cached
      }
      visited.push(directory)
      const name = await this.read(directory)
      if (name !== null) {
        for (const item of visited) this.cache.set(item, name)
        return name
      }
      const parent = dirname(directory)
      if (parent === directory || directory === ".") break
      directory = parent
    }
    for (const item of visited) this.cache.set(item, null)

    return null
  }

  private async read(directory: string): Promise<string | null> {
    const file = Bun.file(join(this.root, directory, "package.json"))
    if (!(await file.exists())) return null
    try {
      const parsed = (await file.json()) as Record<string, unknown>
      const name = parsed["name"]
      return typeof name === "string" && name.trim() !== "" ? name.trim() : null
    } catch {
      return null
    }
  }
}
