# Adoption

> Implementation status: `spec init`, `spec doctor`, structural checks, native adapters, and `spec map --draft` are available. Automatic provisioning is in progress.

## Goal

Adopting the framework must not require rewriting the project, freezing development, or installing a bespoke platform. Adoption is incremental, but the default profile is full-stack and approval requires the full verification path.

## Use-case entry points

| Starting point             | Planned entry                 | Design                           |
| -------------------------- | ----------------------------- | -------------------------------- |
| Empty repository           | `spec start "<goal>"`         | [Scratch](workflow/use-cases.md) |
| Existing repository        | `spec map --review`           | [Mapping](workflow/use-cases.md) |
| Approved baseline changing | `spec refactor "<direction>"` | [Refac](workflow/use-cases.md)   |

The interactive workbench and opencode plugin are design only. The implemented
Phase 1 path remains `spec init`, `spec map --draft`, `spec check`, and
`spec approve`.

## Greenfield

```bash
spec init
spec doctor --fix
spec check
```

The scaffold includes:

- `spec/config.json`;
- `spec/architecture/` with a LikeC4 starter model;
- `spec/capabilities/` with one example capability;
- `spec/requirements/` with a StrictDoc grammar and one example requirement;
- `spec/semantic/` when the optional semantic layer is enabled;
- `spec/verification/` with one example verification objective and case;
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

| Capability              | Supported in Phase 1 | Fallback                    |
| ----------------------- | -------------------- | --------------------------- |
| Generic discovery       | yes                  | manual model                |
| Capabilities            | Phase 2              | manual capability records   |
| Verification planning   | Phase 2              | manual verification records |
| Semantic layer          | Phase 2, optional    | glossary terms and prose    |
| Read-only query/MCP     | Phase 2              | CLI queries and bundle      |
| Explorer                | Phase 2              | audit bundle                |
| Multi-repo workspace    | Phase 3              | separate repositories       |
| Rust discovery          | yes                  | generic discovery           |
| Rust API contracts      | yes                  | rustdoc/rustdoc JSON        |
| JSON Schema contracts   | yes                  | manual table                |
| CLI contracts           | yes                  | help snapshots              |
| TypeScript discovery    | later                | generic discovery           |
| PHP discovery           | later                | generic discovery           |
| Protobuf/wire contracts | later                | manual schema               |
| Hardware contracts      | later                | manual schema               |

The support matrix is explicit. The framework does not claim automatic support for a stack it cannot inspect.

## Adoption checklist

- [ ] `spec init --existing` completed without source changes.
- [ ] `spec doctor --fix` resolved or reported every missing tool.
- [ ] `spec check --structural` produces a gap report.
- [ ] One feature is modeled end to end.
- [ ] Every applied capability has requirements and verification coverage.
- [ ] Every approved requirement has formalization, a verification case, or a waiver.
- [ ] Semantic sources are pinned when the layer is active.
- [ ] Every mapped element has provenance and human review.
- [ ] The audit bundle states the covered scope.
- [ ] The default agent cannot edit approved specs.
- [ ] CI runs the same checks as local development.
