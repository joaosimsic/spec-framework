# Generated spec validation

Date: 2026-11-13

Scope: generated-spec v2, behavior-derived conceptual architecture. Decision
record [0017](../design-decisions/0017-behavior-derived-architecture.md).

Analyzer version: `typescript:1`

AI hypotheses and AI-assisted findings were disabled for this run so
determinism and spec hashes remain reproducible. The AI diagnostic path is
covered by `tests/ai-diagnostics.test.ts` with a fake provider. Verification-run
persistence is covered by `tests/verification-runs.test.ts`, including the
assertion that `spec check` does not modify the canonical spec. Contract
coverage is covered by `tests/contracts.test.ts`; derived interpretations by
`tests/interpretations.test.ts`.

## Repositories

| Repository  | Role             | Commit     | Tracked TS/JS files |
| ----------- | ---------------- | ---------- | ------------------: |
| `boring`    | Small control    | `b5097edb` |                  13 |
| `llm-ruler` | Medium workspace | `7fd64646` |                 408 |
| `TiCrafter` | Large workspace  | `5c7833ae` |                 766 |

Validation used temporary Git clones under `/tmp/spec-framework-validation`. The
original repositories were not analyzed or modified. `llm-ruler` and `TiCrafter`
had existing local changes; their status was unchanged before and after
validation.

## Summary

| Repository  | Analysis | Conceptual | Components | Relationships | Behavior | Flows | Findings | Unassigned | Directory-only | Deterministic |
| ----------- | -------: | ---------: | ---------: | ------------: | -------: | ----: | -------: | ---------: | -------------: | ------------- |
| `boring`    |    2.31s |         64 |          3 |           112 |       30 |    30 |       63 |       0.0% |              0 | yes           |
| `llm-ruler` |   10.20s |        396 |          9 |           619 |      328 |   328 |    1,602 |      14.9% |              0 | yes           |
| `TiCrafter` |   31.01s |        536 |         13 |           562 |      491 |   491 |    2,933 |      10.5% |              0 | yes           |

All three generated specs passed schema validation, reference validation, label
grammar checks, path-secret checks, and approval-status checks.

## Behavior-derived metrics

| Repository  | Mapped files per component | Summaries without evidence | Directory-only components |
| ----------- | -------------------------: | -------------------------: | ------------------------: |
| `boring`    |                       3.33 |                          0 |                         0 |
| `llm-ruler` |                      29.67 |                          0 |                         0 |
| `TiCrafter` |                      36.31 |                          0 |                         0 |

## Contract coverage

| Repository  | Contracts | Verification targets |
| ----------- | --------: | -------------------: |
| `boring`    |         2 |                    3 |
| `llm-ruler` |        10 |                   77 |
| `TiCrafter` |         1 |                  194 |

Unassigned implementation remains visible instead of becoming conceptual
architecture. Rename stability is covered by
`tests/conceptual-architecture.test.ts`; labels and conceptual IDs are unchanged
when a source directory is renamed.

## Performance

### Analysis

| Repository  |   Time |    RSS | Spec size | Database size |
| ----------- | -----: | -----: | --------: | ------------: |
| `boring`    |  2.31s | 349 MB |   0.70 MB |      <0.01 MB |
| `llm-ruler` | 10.20s | 718 MB |  33.99 MB |      64.98 MB |
| `TiCrafter` | 31.01s | 737 MB |  16.40 MB |      61.12 MB |

Spec size includes implementation identities and mappings.

### Workbench API

Median and max over five requests.

| Repository  | Architecture | Graph depth 2 | Graph depth 4 | Generated spec |
| ----------- | -----------: | ------------: | ------------: | -------------: |
| `boring`    |    0ms / 6ms |     0ms / 2ms |     1ms / 1ms |      8ms / 8ms |
| `llm-ruler` |  1ms / 251ms |     2ms / 5ms |     5ms / 5ms |  384ms / 436ms |
| `TiCrafter` |   1ms / 76ms |     1ms / 1ms |     3ms / 3ms |   92ms / 103ms |

Proposed gates:

| Repository  |   Analysis | Graph depth 2 | Graph depth 4 |
| ----------- | ---------: | ------------: | ------------: |
| `boring`    |   under 5s |   under 300ms |   under 800ms |
| `llm-ruler` |  under 30s |   under 500ms |  under 1500ms |
| `TiCrafter` | under 120s |  under 1000ms |  under 3000ms |

All passed.

## Determinism

Each repository was analyzed twice from a clean generated state with the same
commit and analyzer version. Generated spec hashes matched, including snapshot
identity, conceptual IDs, mapping IDs, flow IDs, and finding IDs.

## Qualitative review

### `boring`

- Generated components: `API boring`, `APP boring`, and observed HTTP/CLI
  behavior surfaces.
- Detected package bin, shebang, application main, exported library APIs, and
  HTTP routes.
- Conceptual labels came from anchors, not source directories.
- Findings were dominated by unresolved calls plus unused internal symbols.

### `llm-ruler`

- Generated components: `API llm-ruler`, `APP llm-ruler`, and HTTP route groups
  such as `HTTP /config`, `HTTP /graphs`, and `HTTP /sessions`.
- Mapped 29.67 files per component; 14.9% of implementation stayed unassigned.
- Unknowns are dominated by dynamic or unresolved calls. This is expected and
  visible.
- The generated spec is large because it includes implementation identities and
  behavior-reachability mappings.

### `TiCrafter`

- Generated 13 conceptual components and 562 conceptual relationships without
  schema or reference failures.
- Mapped 36.31 files per component; 10.5% of implementation stayed unassigned.
- Analysis stayed under the 120s gate and under 1 GB RSS.

## Fixes made for v2

- Added behavior-anchor grouping and reachability through resolved calls and
  imports.
- Added deterministic `<ROLE> <anchor>` labels with `label_evidence`.
- Kept files, symbols, and directories out of the conceptual graph.
- Added implementation identities, mapping records, and explicit unassigned
  coverage.
- Added optional AI hypotheses as separate, cited records that cannot change
  labels, identity, summaries, or status.
- Threaded entry point overrides through `spec-framework.json` instead of the
  retired `spec/implementation/entrypoints.json`.
- Updated the workbench to a conceptual-first graph with an implementation
  overlay and unassigned implementation panel.

## Limitations

- Static unknown ratios remain high in dynamically typed call sites.
- Library API class entry points can produce shallow flows.
- Unassigned implementation remains between 10% and 15% on large workspaces
  because dynamic resolution and unreachable code stay explicit.
- AI hypothesis quality is not measured here; AI was disabled for determinism.
- Browser frame-rate profiling is not included; validation measures API latency
  and built asset size.
- Analysis executes no repository code.

## Reproduction

```sh
bun run validate:generated
```

The command writes `/tmp/spec-framework-validation/report.json` and
`/tmp/spec-framework-validation/report.md`.
