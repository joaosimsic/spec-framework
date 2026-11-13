# Problem

## The failure mode

Repositories become hard to understand because their architecture exists only
in code, package metadata, imports, calls, data access, and tests. The visible
documentation is usually stale, incomplete, or disconnected from implementation.

LLM-written specifications make this worse. They can produce fluent prose that
looks complete while inventing components, omitting flows, and asserting
certainty that the repository does not support.

## Failure taxonomy

### 1. Undefined boundaries

Directories and packages exist, but no generated model explains which
subsystems, components, entry points, and data stores they form.

**Required mechanism:** deterministic architecture reconstruction from source
structure and imports.

### 2. Missing implementation links

A conceptual component is named, but no file, symbol, entry point, or call path
shows how it is implemented.

**Required mechanism:** stable generated IDs and direct links from generated
architecture nodes to files and symbols.

### 3. Unbounded behavior claims

A document says what the system does, but static analysis cannot prove complete
runtime behavior.

**Required mechanism:** evidence classes, confidence, explicit unknowns, and
bounded flow analysis.

### 4. Claims without provenance

A generated statement sounds authoritative but does not cite a source location,
call edge, data access, or configured check.

**Required mechanism:** every generated record carries provenance and evidence.

### 5. No verification link

Tests and contracts exist, but nothing maps them to observed behavior.

**Required mechanism:** generated verification records from test symbols,
compiler results, and configured checks.

### 6. Drift

Architecture documentation changes independently from code.

**Required mechanism:** regenerate output from the repository snapshot. Do not
inherit hand-maintained architecture files.

### 7. False confidence

Generated output hides ambiguity and presents inferred behavior as observed.

**Required mechanism:** confidence labels and unknowns at element, edge, flow,
and finding level.

### 8. Two competing models

A curated intent graph and a generated implementation graph disagree, and the
workbench joins them without a clear authority boundary.

**Required mechanism:** retire the curated model. One generated spec product,
one workbench projection.

## Design requirements

The solution must:

1. Analyze a repository without executing its code.
2. Build a language-neutral implementation IR.
3. Reconstruct architecture hierarchy deterministically.
4. Trace bounded static flows from entry points.
5. Generate contracts from observed surfaces.
6. Generate verification records from tests and configured checks.
7. Detect deterministic architectural problems.
8. Separate AI hypotheses from deterministic findings.
9. Persist snapshots and support comparison.
10. Make uncertainty visible.
11. Keep the workbench read-only over generated output.
12. Reproduce output from the same commit and analyzer versions.
