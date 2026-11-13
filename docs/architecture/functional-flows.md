# Functional flows

Status: implemented.

## Purpose

A dependency graph answers what connects to what. Functional flows answer what
happens when the system runs.

The engine reconstructs bounded, evidence-classified paths from entry points to
outputs, persistence, and external side effects.

It does not claim complete runtime behavior.

## Entry points

Supported entry point kinds:

- HTTP routes;
- CLI commands;
- application main functions;
- exported library APIs;
- event handlers;
- message queue consumers;
- scheduled jobs;
- UI event handlers where statically identifiable.

Detection uses heuristics plus explicit configuration.

Entry-point overrides live in `spec-framework.json`:

```json
{
  "version": 1,
  "analysis": {
    "entry_points": {
      "include": [{ "kind": "cli", "path": "bin/spec.ts" }],
      "exclude": [{ "path": "scripts/experimental.ts" }]
    }
  }
}
```

Every detected entry point records provenance and confidence.

## Flow model

A flow contains:

| Field         | Meaning                                                   |
| ------------- | --------------------------------------------------------- |
| `id`          | Stable flow identity                                      |
| `entry_point` | Entry node and kind                                       |
| `steps`       | Ordered call and transformation steps                     |
| `branches`    | Conditional branches where statically visible             |
| `sources`     | Inputs and data reads                                     |
| `sinks`       | Outputs, writes, network, database, queue, external calls |
| `returns`     | Return values and emitted events                          |
| `errors`      | Error and exception paths where visible                   |
| `evidence`    | Evidence classification                                   |
| `confidence`  | observed, inferred, ambiguous, unknown                    |
| `unknowns`    | Explicit unresolved steps                                 |

## Evidence classes

| Class          | Meaning                               |
| -------------- | ------------------------------------- |
| Static         | Inferred from source code             |
| Runtime        | Observed during execution             |
| Test           | Exercised by an automated test        |
| AI-inferred    | Proposed by semantic interpretation   |
| Human-verified | Reviewed and confirmed by an engineer |

The first release produces static flows. Test, runtime, AI, and human classes
exist in the model so later evidence can be added without changing the shape.

## Algorithm

1. Select entry points from config and heuristics.
2. Traverse resolvable call edges breadth-first.
3. Record each step with node, file, line, and resolution state.
4. Collect input and output data where types or literals are resolvable.
5. Classify sinks by API and call target.
6. Record branches and error paths where statically visible.
7. Stop at external calls, dynamic dispatch, depth limit, or path limit.
8. Deduplicate identical paths deterministically.
9. Mark incomplete paths as unknown.

Limits:

- maximum depth per path;
- maximum paths per entry point;
- maximum total steps per analysis;
- maximum output size.

Limits are configuration, not silent truncation. Reaching a limit creates an
explicit finding.

## Sinks and sources

Sources:

- command-line arguments;
- environment variables;
- HTTP request data;
- file reads;
- database reads;
- queue messages;
- function parameters;
- configuration files.

Sinks:

- file writes;
- network calls;
- database writes;
- queue publishes;
- environment mutation;
- standard output and error;
- external process calls;
- return values and emitted events.

Classification is allowlist-based per language. Unknown APIs remain unknown.

## Trace directions

- **Trace from input**: start at an entry point and follow processing to sinks.
- **Trace to origin**: start at an output or sink and walk backward to entry
  points and upstream transformations.

Both directions read the same flow graph and preserve evidence labels.

## Workbench

The Flow view shows:

- entry point list;
- ordered steps;
- branches and merges;
- sources and sinks;
- evidence class and confidence;
- unknowns and limits reached;
- highlight in the System graph.

Selecting a step opens the function inspector with its calls, data, and source
location.

## Invariants

- A statically reachable function is not presented as executed behavior.
- Incomplete paths are visible.
- AI flow hypotheses are separate from static flows.
- Flows never grant approval.
- Repository code is parsed, never executed.
