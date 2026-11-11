import { mkdir } from "node:fs/promises"
import { join, basename } from "node:path"

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
  user = actor 'User'
  exampleSystem = system 'Example system'
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

const configFor = (name: string, existing: boolean) => `{
  "version": 1,
  "profile": "full",
  "project": {
    "name": ${JSON.stringify(name)},
    "adoption": ${JSON.stringify(existing ? "existing" : "greenfield")}
  },
  "adapters": {
    "architecture": "likec4",
    "requirements": "strictdoc",
    "formal": "quint",
    "contracts": ["json-schema", "cli"]
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

Approved content is hash-locked in \`spec.lock\`.
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

Run:

\`\`\`bash
quint typecheck spec/formal/*.qnt
quint verify spec/formal/*.qnt --invariant <property>
\`\`\`
`

const contractsReadme = `# Contracts

Contract definitions live here. Phase 1 supports JSON Schema, CLI snapshots, and
Rust public API adapters. Every contract declares an owner, consumers, and a
compatibility policy.
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

  const dirs = [
    "architecture",
    "requirements",
    "formal",
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
    "config.json": configFor(basename(target), Boolean(options.existing)),
    "README.md": specReadme,
    "requirements/example.sdoc": requirementTemplate,
    "architecture/model.c4": architectureTemplate,
    "formal/README.md": formalReadme,
    "contracts/README.md": contractsReadme,
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
