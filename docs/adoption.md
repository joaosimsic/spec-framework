# Adoption

## Goal

Adopting the framework must not require rewriting the project, freezing development, or installing a bespoke platform. Adoption is incremental, but the default profile is full-stack and approval requires the full verification path.

## Greenfield

```bash
spec init
spec doctor --fix
spec check
```

The scaffold includes:

- `spec.config.yaml`;
- `spec/architecture/` with a LikeC4 starter model;
- `spec/requirements/` with a StrictDoc grammar and one example requirement;
- `spec/formal/` with a Quint module skeleton;
- `spec/contracts/` with the selected adapters;
- `spec/toolchain.lock.json`;
- project-local agent rules and commands.

Remove the examples and start with the first real feature.

## Existing project

```bash
spec init --existing
spec doctor --fix
spec map --draft
spec check --structural
```

`spec init --existing`:

- detects languages, build systems, package manifests, and existing docs;
- proposes contract adapters;
- writes configuration but does not modify source code;
- creates an empty or partial architecture model;
- creates a baseline gap report.

`spec map --draft` extracts a draft architecture graph. Every extracted element has `code:` provenance and `draft` status. Nothing is approved automatically.

## Incremental adoption

Do not retro-specify the entire project. Adopt by feature or subsystem:

1. Choose one feature with clear boundaries.
2. Model its components and relations.
3. Write or extract its requirements.
4. Link to contracts and formal properties.
5. Run full checks.
6. Approve that slice.
7. Implement only from approved IDs.
8. Repeat.

The rest of the project remains outside the specification. The audit bundle states the covered scope explicitly. This prevents a false claim that the whole system is specified.

## Existing architecture mapping

`spec map` is the fast path to a reviewable architecture:

- generic discovery reads directories, manifests, and import structure;
- the Rust adapter reads `cargo metadata` and rustdoc JSON;
- output is draft LikeC4;
- humans curate names, boundaries, responsibilities, and relations;
- approved elements become the baseline.

Mapping is not approval. Extracted structure describes what the code does, not what the architecture should be.

## Coexistence

- The framework does not replace the build system.
- It does not require a monorepo.
- It does not require HTTP.
- It does not require a specific language.
- Unsupported languages use generic discovery plus manual modeling.
- Existing documentation can be imported as draft requirements with `doc:` provenance.

## Support matrix

| Capability | Supported in Phase 1 | Fallback |
|---|---|---|
| Generic discovery | yes | manual model |
| Rust discovery | yes | generic discovery |
| Rust API contracts | yes | rustdoc/rustdoc JSON |
| JSON Schema contracts | yes | manual table |
| CLI contracts | yes | help snapshots |
| TypeScript discovery | later | generic discovery |
| PHP discovery | later | generic discovery |
| Protobuf/wire contracts | later | manual schema |
| Hardware contracts | later | manual schema |

The support matrix is explicit. The framework does not claim automatic support for a stack it cannot inspect.

## Adoption checklist

- [ ] `spec init --existing` completed without source changes.
- [ ] `spec doctor --fix` resolved or reported every missing tool.
- [ ] `spec check --structural` produces a gap report.
- [ ] One feature is modeled end to end.
- [ ] Every approved requirement has formalization or a waiver.
- [ ] Every mapped element has provenance and human review.
- [ ] The audit bundle states the covered scope.
- [ ] The default agent cannot edit approved specs.
- [ ] CI runs the same checks as local development.
