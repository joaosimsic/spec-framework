# Glossary

| Term                   | Meaning                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Analysis IR            | Language-neutral representation of files, symbols, calls, imports, entry points, and data access. |
| Analyzer version       | Version of the analysis implementation that produced a snapshot.                                  |
| Audit bundle           | Generated readable output containing the generated spec, evidence, flows, findings, and manifest. |
| Confidence             | Generated evidence class: observed, inferred, ambiguous, or unknown.                              |
| Contract record        | Observed public surface generated from manifests, exports, routes, or configured checks.          |
| Deterministic finding  | Rule-based diagnostic reproducible from a snapshot.                                               |
| Entry point            | CLI, route, library API, job, or event handler where execution enters the system.                 |
| Evidence               | Source location, tool result, or check output supporting a generated record.                      |
| Flow                   | Bounded static path from an entry point through resolved calls to sources or sinks.               |
| Generated spec         | Canonical `spec/generated/spec.gen.json` produced from one snapshot.                              |
| Generated architecture | System/subsystem/component hierarchy reconstructed from repository structure.                     |
| Mapping                | Generated link from a conceptual element to files and symbols.                                    |
| Observed behavior      | Generated description of behavior supported by source evidence; not a normative requirement.      |
| Provenance             | Origin of a generated record, such as source path, tool, or model.                                |
| Rule version           | Version of deterministic diagnostics used by a snapshot.                                          |
| Snapshot               | Recorded analysis result for a commit and set of versions.                                        |
| Unknown                | Explicit gap where analysis cannot determine the value.                                           |
| AI hypothesis          | Evidence-bound, schema-validated interpretation; never a verdict or approval.                     |
| Workbench              | Local React/Vite surface over generated output.                                                   |
| Registered root        | Canonical local directory explicitly allowed for analysis.                                        |
