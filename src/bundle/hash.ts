import { createHash } from "node:crypto"

export class BundleHasher {
  static bytes(content: Uint8Array | string): string {
    const digest = createHash("sha256").update(content).digest("hex")

    return `sha256:${digest}`
  }
}
