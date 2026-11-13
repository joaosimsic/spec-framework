# Adoption

## Goal

Adopting the framework must not require rewriting the project. It analyzes the
repository and generates a spec product from evidence.

## Existing project

```bash
bun install
bun run build:workbench
bun run bin/spec.ts analyze
bun run bin/spec.ts workbench
```

Register an additional local repository:

```bash
bun run bin/spec.ts projects add /workspace/other-project
bun run bin/spec.ts analyze --analysis-root /workspace/other-project
```

## Configuration

Commit `spec-framework.json` at the repository root:

```json
{
  "version": 1,
  "project": { "name": "my-project" },
  "analysis": {
    "roots": ["."],
    "exclude": ["dist", "coverage"],
    "flow_analysis": true
  },
  "diagnostics": {
    "ARC-002": { "threshold": 12 },
    "ARC-003": { "threshold": 12 }
  }
}
```

Do not hand-write architecture or requirement files. Analysis reconstructs them
from the repository.

## What is generated

- architecture hierarchy;
- files and symbols;
- observed behavior records;
- observed contracts;
- verification records;
- functional flows;
- deterministic findings;
- optional AI hypotheses;
- snapshots and comparison;
- audit bundle.

## Incremental adoption

Start with one repository. Review:

1. generated architecture hierarchy;
2. entry points and flows;
3. unassigned files and unresolved calls;
4. findings;
5. snapshot comparison after a change.

Expand analysis roots or add external checks when useful.

## Support matrix

| Capability                             | Supported now | Fallback                    |
| -------------------------------------- | ------------- | --------------------------- |
| TypeScript/JavaScript analysis         | yes           | none                        |
| Generated architecture                 | yes           | package/directory grouping  |
| Static flows                           | yes           | bounded unresolved findings |
| Deterministic diagnostics              | yes           | unknown classification      |
| AI hypotheses                          | optional      | none                        |
| Rust discovery                         | legacy only   | not part of generated spec  |
| Authored LikeC4/StrictDoc/Quint inputs | retired       | regenerate from source      |

## Migration from curated specs

- Remove reliance on `spec/architecture`, `spec/requirements`, `spec/formal`,
  `spec/contracts`, and `spec/spec.lock`.
- Add `spec-framework.json`.
- Run analysis and inspect generated output.
- Delete curated spec inputs after the generated equivalent is reviewed.
- Do not copy generated output back into source.

## Adoption checklist

- [ ] `spec-framework.json` committed.
- [ ] `spec analyze` succeeds.
- [ ] Generated System view opens.
- [ ] Flows and findings are visible.
- [ ] Snapshot comparison works after one change.
- [ ] No workbench route reads curated spec sources.
- [ ] No generated output claims approval.
