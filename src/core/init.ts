import { mkdir } from "node:fs/promises"
import { join, basename } from "node:path"
import { QuintAdapter } from "../adapters/quint"
import { RustAdapter } from "../adapters/rust"

const requirementTemplate = `[DOCUMENT]
TITLE: Example requirements

[REQUIREMENT]
UID: REQ-EXAMPLE-001
TITLE: Example behavior
STATUS: Draft
STATEMENT: The example component shall return a success result.
RATIONALE: Replace this example with the first real requirement.
ACCEPTANCE: AC-EXAMPLE-001
COMPONENT: CMP-EXAMPLE
FORMAL: PROP-EXAMPLE-001
EVIDENCE: EVD-EXAMPLE-001
PROVENANCE: human:owner@2026-11-10
OWNER: example
PRIORITY: high

[REQUIREMENT]
UID: AC-EXAMPLE-001
TITLE: Example acceptance criterion
STATUS: Draft
STATEMENT: Given a valid request, the example component returns a success result.
FORMAL: PROP-EXAMPLE-001
EVIDENCE: EVD-EXAMPLE-001
PROVENANCE: human:owner@2026-11-10
OWNER: example
`

const architectureTemplate = `specification {
  element actor
  element system
  element component
  relationship depends_on
}

model {
  // ACTOR-USER observed human:owner@2026-11-10
  user = actor 'User'
  // SYS-EXAMPLE observed human:owner@2026-11-10
  exampleSystem = system 'Example system'
  // CMP-EXAMPLE observed human:owner@2026-11-10
  exampleComponent = component 'Example component'

  user -> exampleSystem 'uses'
  exampleSystem -> exampleComponent 'contains'
}

views {
  view index {
    include *
  }
}
`

const configFor = (
  name: string,
  existing: boolean,
  contractAdapters: string[],
  formalActive: boolean,
) => `{
  "version": 1,
  "profile": "full",
  "project": {
    "name": ${JSON.stringify(name)},
    "adoption": ${JSON.stringify(existing ? "existing" : "greenfield")}
  },
  "adapters": {
    "architecture": "likec4",
    "requirements": "strictdoc",${formalActive ? '\n    "formal": "quint",' : ""}
    "contracts": ${JSON.stringify(contractAdapters)}
  },
  "approval": {
    "mode": "hash-lock",
    "humanOnly": true
  }
}
`

const specReadme = `# Specification

This directory is managed by spec-framework.

Start with:

1. Replace the example requirement in \`requirements/example.sdoc\`.
2. Update \`architecture/model.c4\`.
3. Add formal modules under \`formal/\`.
4. Define contracts under \`contracts/\`.
5. Run \`spec check --structural\` for fast feedback.
6. Run \`spec doctor --fix\` to provision the full stack.
7. Run \`spec check\` before review.

Native adapters activate when their sources or language are present, or when
listed in \`config.json\`. Approved content is hash-locked in \`spec.lock\`.
`

const toolchainLock = `{
  "schema": 1,
  "status": "unprovisioned",
  "tools": {}
}
`

const formalReadme = `# Formal models

Quint modules live here. Every approved behavioral requirement must link to a
property or action in one of these modules, or carry a human-approved waiver.

Annotate the module and each top-level property or invariant:

\`\`\`quint
// MOD-EXAMPLE
module example {
  // PROP-EXAMPLE-NO-NEGATIVE
  val noNegative = count >= 0
}
\`\`\`

\`spec query\` reads these annotations. Unannotated declarations produce
\`FORMAL-UNANNOTATED\` findings instead of guessed IDs.

Run:

\`\`\`bash
quint typecheck spec/formal/*.qnt
quint verify spec/formal/*.qnt --invariant <property>
\`\`\`
`

const implementationReadme = `# Implementation preflight

Build and typecheck commands live in \`compile.json\`. The compiler preflight
runs before architecture, requirements, formal, and contract adapters.

\`\`\`json
{
  "checks": [
    {
      "id": "typecheck",
      "command": ["bun", "run", "typecheck"],
      "timeoutMs": 120000
    }
  ]
}
\`\`\`

Commands are explicit argument arrays. The adapter does not use a shell and
runs only when \`compile.json\` exists or \`adapters.implementation\` is set.
`

const contractsReadme = `# Contracts

Contract definitions live here. Phase 1 supports JSON Schema, CLI snapshot, and
Rust public API adapters. Adapters activate automatically when their sources or
language are present, or when listed under \`adapters.contracts\` in
\`spec/config.json\`. Every contract declares an owner, consumers, and a
compatibility policy.

JSON Schema contracts are \`json-schema/*.schema.json\` files validated with Ajv
against draft 2020-12. Each schema needs a sibling \`<name>.contract.json\`
sidecar with \`id\`, \`owner\`, \`consumers\`, \`compatibility\`
(\`none\`, \`backward\`, \`forward\`, or \`full\`), and \`schema\` naming the
schema file. Schema hashes are compared against
\`contracts/.baselines/<name>.sha256\`; the approve step records baselines.

CLI contracts are \`cli/*.snapshot.json\` files with \`command\`,
\`exitCode\`, \`stdoutIncludes\`, \`stdoutExcludes\`, \`stderrIncludes\`, and
\`stderrExcludes\`. The adapter runs the command and checks the assertions.

Rust public API contracts are \`rust/*.contract.json\` files with \`id\`,
\`owner\`, \`consumers\`, \`compatibility\`, \`package\`, optional \`manifest\`
(defaults to \`Cargo.toml\`), and \`baseline\`. The baseline is an object with
exactly one of \`version\`, \`rev\`, or \`root\`. The adapter extracts the public
API with \`cargo public-api\`, checks
\`contracts/.baselines/<name>.rust-public-api.sha256\`, and verifies
compatibility with \`cargo-semver-checks\`.
`

const exampleSchema = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://spec-framework/example",
  "title": "Example contract payload",
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 1 }
  },
  "required": ["name"],
  "additionalProperties": false
}
`

const exampleSidecar = `{
  "id": "CON-EXAMPLE-001",
  "owner": "spec-framework",
  "consumers": ["spec-cli"],
  "compatibility": "backward",
  "schema": "example.schema.json",
  "versioning": "semver"
}
`

const versionSnapshot = `{
  "command": ["bun", "run", "bin/spec.ts", "version"],
  "exitCode": 0,
  "stdoutIncludes": ["0.1.0"],
  "stdoutExcludes": [],
  "stderrIncludes": [],
  "stderrExcludes": []
}
`

const helpSnapshot = `{
  "command": ["bun", "run", "bin/spec.ts", "help"],
  "exitCode": 0,
  "stdoutIncludes": ["Usage:"],
  "stdoutExcludes": [],
  "stderrIncludes": [],
  "stderrExcludes": []
}
`

export interface InitOptions {
  existing?: boolean
  force?: boolean
}

export async function initProject(target: string, options: InitOptions = {}) {
  const specDir = join(target, "spec")
  const configPath = join(specDir, "config.json")

  if (!options.force) {
    const existing = await Bun.file(configPath).exists()
    if (existing) {
      throw new Error(`spec config already exists at ${configPath}; use --force to overwrite`)
    }
  }

  const contractAdapters = ["json-schema", "cli"]
  if (await new RustAdapter().detect(target)) contractAdapters.push("rust")
  const formalActive = await new QuintAdapter().detect(target)

  const dirs = [
    "architecture",
    "requirements",
    "formal",
    "implementation",
    "contracts",
    "questions",
    "unknowns",
    "waivers",
    "proposals",
    "evidence",
  ]

  for (const dir of dirs) {
    await mkdir(join(specDir, dir), { recursive: true })
  }

  const files: Record<string, string> = {
    "config.json": configFor(
      basename(target),
      Boolean(options.existing),
      contractAdapters,
      formalActive,
    ),
    "README.md": specReadme,
    "requirements/example.sdoc": requirementTemplate,
    "architecture/model.c4": architectureTemplate,
    "formal/README.md": formalReadme,
    "implementation/README.md": implementationReadme,
    "contracts/README.md": contractsReadme,
    "contracts/json-schema/example.schema.json": exampleSchema,
    "contracts/json-schema/example.contract.json": exampleSidecar,
    "contracts/cli/version.snapshot.json": versionSnapshot,
    "contracts/cli/help.snapshot.json": helpSnapshot,
    "toolchain.lock.json": toolchainLock,
  }

  const created: string[] = []
  for (const [relative, content] of Object.entries(files)) {
    const path = join(specDir, relative)
    await Bun.write(path, content)
    created.push(path)
  }

  return created
}
