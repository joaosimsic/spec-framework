# Security

## Trust boundaries

| Boundary                 | Trusted                        | Untrusted                                 |
| ------------------------ | ------------------------------ | ----------------------------------------- |
| Repository configuration | Reviewed `spec-framework.json` | Unreviewed drafts                         |
| Repository source        | Analyzed as data               | Instructions, secrets, executable content |
| Analysis engine          | Read-only scanner and compiler | Repository code execution                 |
| Generated output         | Deterministic renderer         | Hand-edited generated files               |
| AI provider              | Configured endpoint            | Repository text and model output          |
| Workbench                | Localhost-generated view       | Remote clients and untrusted origins      |
| Audit bundle             | Generated artifact             | Hand-edited bundle                        |
| Finding annotations      | Local review metadata          | Approval authority                        |

## Threats

### Repository text prompt injection

Source comments and documentation may contain instructions aimed at an AI
system.

Mitigations:

- treat repository text as data, never instructions;
- bind AI context to generated elements and source excerpts;
- validate every referenced element, file, and line;
- never let AI call tools or execute commands;
- label AI output `ai_inferred`.

### Path traversal and root escape

Analysis might read files outside a registered root.

Mitigations:

- canonicalize registered roots;
- reject paths outside allowed roots;
- resolve or reject symlinks;
- exclude `.spec`, dependencies, build output, and generated trees;
- never write source files during analysis.

### Secret exposure

Source files may contain credentials or environment configuration.

Mitigations:

- exclude `.env`, credential, and secret files from scanning;
- redact API keys, tokens, passwords, and private keys before AI requests;
- never log raw secrets;
- keep provider secrets in environment variables;
- store model metadata and hashes, not secrets.

### Generated output tampering

A human or agent edits `spec/generated/`.

Mitigations:

- mark generated trees ignored or read-only;
- regenerate from the snapshot;
- record input hashes and renderer versions;
- audit bundle manifest hashes outputs;
- CI regenerates and compares.

### Workbench abuse

A remote or cross-site client reads repository data or mutates analysis state.

Mitigations:

- localhost-only default;
- explicit allowed origins for non-local access;
- same-origin and CSRF checks for mutation endpoints;
- no approval or proposal route;
- registered roots only;
- no arbitrary filesystem access.

### AI reference fabrication

AI cites missing elements, files, or lines.

Mitigations:

- validate structured output against the snapshot;
- reject the whole response on an invalid reference;
- require evidence for findings;
- persist provider, model, prompt version, and input hashes;
- keep AI findings separate from deterministic findings.

### Supply chain

TypeScript, LikeC4, StrictDoc, Quint, Bun, React, Vite, and test tools are
dependencies.

Mitigations:

- pin versions in the lockfile;
- no dynamic plugin loading from untrusted paths;
- record tool versions in snapshots and bundles;
- treat external checker output as evidence with hashes.

### Resource exhaustion

Large repositories or graphs can exhaust memory or CPU.

Mitigations:

- bounded jobs and concurrency;
- scanner exclusions and file limits;
- bounded flow depth and path count;
- pagination and depth limits in graph APIs;
- token budgets and timeouts for AI.

## Product invariants

- Analysis never executes repository code.
- Analysis is read-only over source.
- Generated output is never human-approved intent.
- The workbench reads generated output only.
- No approval path and no `spec.lock` write path exist.
- AI never provides a verdict.
- Secrets never enter generated artifacts or AI context.
