# Vision

## End state

A repository has a generated, auditable description of what it does, how it is
implemented, and where its architecture is uncertain.

The description is produced by deterministic analysis:

- conceptual architecture reconstructed from entry points, interfaces, calls,
  data access, and external boundaries;
- implementation mapped underneath conceptual elements;
- behavior records generated from entry points, calls, data access, and tests;
- contracts generated from observed public surfaces;
- verification records generated from configured checks and test evidence;
- flows and diagnostics generated from the analysis graph;
- an audit bundle generated from the same snapshot.

The workbench is the primary human surface. It reads generated output only. A
human lands on the System view, drills from a generated subsystem or component
to files and symbols, follows a flow from an entry point to its sources and
sinks, and reviews findings with evidence and confidence.

Generated output never claims human approval, normative intent, or complete
runtime behavior. It exposes provenance, confidence, and unknowns.

## Roles

### Human

The human:

- chooses which repositories to analyze;
- sets analysis roots, exclusions, thresholds, and optional external checks;
- reads the generated System view, flows, findings, and audit bundle;
- adds local annotations to findings;
- uses the generated evidence to make engineering decisions.

The human does not hand-author architecture or requirements inside the tool.

### Agent

The agent:

- runs analysis and queries generated output;
- explains generated evidence;
- proposes hypotheses with citations;
- files unknowns instead of guessing;
- never approves, certifies, or passes a check.

### Deterministic tools

The scanner, TypeScript compiler, graph builder, flow analyzer, diagnostics,
schema validators, configured build/test commands, and generated-spec renderer
are reproducible.

## What success looks like

- An unfamiliar TypeScript repository produces a navigable System view without
  hand-written architecture files.
- Every generated element cites source evidence or an explicit unknown.
- Conceptual components are derived from observable behavior, not directory names.
- Entry points are linked to flows and data access.
- Findings are reproducible from a snapshot and carry evidence.
- Two snapshots can be compared by commit.
- Removing AI does not change the generated architecture, flows, or findings.
- Removing the LLM does not make the output unauditable.

## What success does not look like

- A hand-maintained diagram that drifts from code.
- A generated document that presents inference as approved fact.
- An AI answer without references.
- A workbench that mixes curated intent with observed code without labels.
- A product that claims complete runtime behavior from static analysis.

## Non-goals

- Proving arbitrary implementation code correct.
- Generating formal proofs without authored formal inputs.
- Recovering complete runtime behavior from static analysis.
- Claiming normative requirements from code alone.
- Replacing domain expertise or design judgment.
- Supporting every language in the first release.

## Long-term direction

The generated spec contract stays language-neutral. TypeScript/JavaScript is the
first adapter. Later adapters contribute the same IR, architecture, flows,
contracts, and findings without changing the workbench or audit contract.

The spec product is reproducible for a commit, analyzer version, rule version,
prompt version, and model version. Generated output remains evidence, never
approval.
