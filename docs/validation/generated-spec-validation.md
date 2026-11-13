# Generated spec validation

Date: 2026-11-13

Scope: generated-spec v1, directory-based architecture. The behavior-derived
conceptual architecture from decision record 0017 requires a new validation
run with directory-only-component, mapping, and rename-stability metrics.

Analyzer version: `typescript:1`

Decision record: [0016](../design-decisions/0016-generated-spec-product.md)

## Repositories

| Repository  | Role             | Commit     | Tracked TS/JS files |
| ----------- | ---------------- | ---------- | ------------------: |
| `boring`    | Small control    | `b5097edb` |                  13 |
| `llm-ruler` | Medium workspace | `7fd64646` |                 408 |
| `TiCrafter` | Large workspace  | `5c7833ae` |                 766 |

Validation used temporary Git clones under `/tmp/spec-framework-validation`. The
original repositories were not analyzed or modified. `llm-ruler` and
`TiCrafter` had existing local changes; their status was unchanged before and
after validation.

## Summary

| Repository  | Analysis | Elements | Relationships | Behavior | Flows | Findings | Deterministic |
| ----------- | -------: | -------: | ------------: | -------: | ----: | -------: | ------------- |
| `boring`    |    2.20s |      272 |           356 |       30 |    30 |       62 | yes           |
| `llm-ruler` |   17.33s |    5,207 |        10,070 |      328 |   328 |    1,264 | yes           |
| `TiCrafter` |   54.58s |   11,182 |        18,752 |      491 |   491 |    2,933 | yes           |

All three generated specs passed schema validation, reference validation,
hierarchy checks, path-secret checks, and approval-status checks.

## Performance

### Analysis

| Repository  |   Time |    RSS | Spec size | Database size |
| ----------- | -----: | -----: | --------: | ------------: |
| `boring`    |  2.20s | 328 MB |   0.51 MB |      <0.01 MB |
| `llm-ruler` | 17.33s | 794 MB |  14.66 MB |      47.09 MB |
| `TiCrafter` | 54.58s | 610 MB |  19.83 MB |      63.37 MB |

### Workbench API

Median and max over five requests.

| Repository  | Architecture | Graph depth 2 | Graph depth 4 | Generated spec |
| ----------- | -----------: | ------------: | ------------: | -------------: |
| `boring`    |    0ms / 5ms |     1ms / 2ms |     1ms / 2ms |      5ms / 6ms |
| `llm-ruler` |   0ms / 78ms |     2ms / 3ms |     6ms / 6ms |  166ms / 174ms |
| `TiCrafter` |   0ms / 73ms |     4ms / 5ms |    8ms / 19ms |  106ms / 120ms |

Architecture cold-start builds the projection and caches it. Graph requests reuse
that cache, matching the workbench load order.

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
identity, element IDs, relationship IDs, flow IDs, and finding IDs.

## Qualitative review

### `boring`

- Detected package bin, shebang, application main, and exported library APIs.
- Generated hierarchy resolved to one component with files and symbols.
- One application-main flow captured 53 steps, 23 sources, 55 sinks, and 31
  unknowns.
- Findings were dominated by unresolved calls plus unused internal symbols.
- `ARC-007` member noise was removed by excluding class/interface members from
  the unused-code rule.

### `llm-ruler`

- Detected workspace packages, application main functions, scripts, and HTTP
  routes such as `GET /health`, `GET /config`, and `DELETE /config`.
- Generated hierarchy includes package, subsystem, component, file, and symbol
  levels.
- Behavior records correctly distinguish observed entry points from inferred
  HTTP routes.
- Unknowns are dominated by dynamic or unresolved calls. This is expected and
  visible.

### `TiCrafter`

- Detected exported library classes and application entry points across a large
  workspace.
- Generated 11,182 architecture elements and 18,752 relationships without
  schema or reference failures.
- Library API entry points produce many one-step flows. This is accurate but
  less useful than application-level flows; it is recorded as a limitation.
- Analysis stayed under the 120s gate and under 1 GB RSS.

## Fixes made during validation

- Fixed `/api/v1/projects/current/*` alias resolution.
- Added interface/class property nodes to generated architecture so findings
  reference existing elements.
- Filtered findings whose affected elements are outside the generated
  architecture.
- Replaced raw `"approved"` string detection with status-field traversal.
- Removed noisy unused-code findings for methods, properties, and constructors.
- Aggregated unresolved-call findings by owner and call name.
- Replaced quadratic child counting in architecture projection.
- Switched workbench projection to read generated specs and cache the result.
- Reduced cold architecture latency from seconds to under 100ms on the large
  repositories.

## Limitations of this validation

These results validate generated-spec v1, where conceptual nodes are still
directory-derived. They do not validate behavior-derived conceptual components.

The next validation run must additionally report:

- conceptual components with behavior evidence;
- directory-only conceptual components;
- unassigned implementation percentage;
- mapped files per conceptual component;
- summaries without evidence;
- conceptual identity stability after directory renames.

## Limitations

- Static unknown ratios remain high in dynamically typed call sites.
- Library API class entry points can produce shallow flows.
- Generated behavior records describe evidence-bound observed behavior, not
  normative requirements.
- Browser frame-rate profiling is not included; validation measures API latency
  and built asset size.
- Analysis executes no repository code.

## Reproduction

```sh
bun run validate:generated
```

The command writes `/tmp/spec-framework-validation/report.json` and
`/tmp/spec-framework-validation/report.md`.
