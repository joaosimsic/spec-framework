# Open questions

## Generated spec contract

- Should `spec.gen.json` be committed for review or always generated locally?
- Which generated requirement records are useful without implying normative intent?
- How should generated observed contracts represent compatibility uncertainty?
- How should generated verification coverage roll up without overstating tests?

## Architecture reconstruction

- Which package and directory heuristics produce the least ambiguous hierarchy?
- How should generated subsystems map to monorepo workspaces and multi-package roots?
- When should a directory become a component instead of a subsystem?
- How should generated ownership be represented when no manifest owner exists?

## Flows

- Which unresolved call patterns should become unknowns versus omitted edges?
- How should branches be represented without a full control-flow graph?
- What limits keep large-repository flows useful?
- When should runtime evidence be added?

## AI

- Which hypotheses are safe to generate from bounded context?
- How should AI finding confidence be calibrated?
- Which provider modes should be supported after the local OpenAI-compatible endpoint?
- How should prompt versions be compared across snapshots?

## Workbench

- How should generated documents be presented alongside graph views?
- Should generated output be rendered as HTML, Markdown, or both?
- How should large symbol graphs remain interactive?
- Which local finding annotations should be exportable?

## Migration

- How should curated spec users migrate without losing information?
- Should there be a one-time legacy import that produces generated output?
- When should curated source directories be removed automatically?
- How should repositories with no TypeScript sources be represented?

## Audit

- Which renderer should replace the dependency-free PDF fallback?
- Should the audit bundle include full generated IR or only `spec.gen.json`?
- How should evidence from external checkers be hashed and reproduced?
- What is the minimum manifest for reproducibility?

## Privacy and security

- Which secret patterns must be excluded before scanning?
- How should remote AI providers prove redaction?
- How should registered roots be configured for multi-repository users?
- Which resource limits prevent denial of service on huge repositories?
