# Open questions

## Bundle

- Can StrictDoc HTML/PDF embed LikeC4 views and Quint literate sections cleanly, or is a Typst/Pandoc assembly step required?
- The first slice uses a dependency-free deterministic text PDF. Which richer renderer should replace it: StrictDoc HTML2PDF, LaTeX, or Typst?
- Should the HTML bundle stay a single page or grow into a static site or StrictDoc's export plus linked views?

## Approval

- Is a hash lock plus signed git tag sufficient, or is a signed manifest required?
- Should approval tokens be supported for CI-only environments?
- How should multi-person approval be represented?

## Mapping

- How much confidence can generic discovery provide without source parsing?
- Should TypeScript discovery use `dependency-cruiser`, `ts-morph`, or compiler APIs?
- How should runtime topology be mapped when it is not visible in build metadata?
- How should monorepos and multi-repo systems share IDs?

## Formal

- Which properties should be mandatory for every behavioral requirement?
- How should liveness properties be bounded for practical CI?
- What is the generic conformance trace format?
- When should Alloy be used alongside Quint?

## Contracts

- Which contract format should be the default for configuration files: JSON Schema or CUE?
- How should CLI contracts represent streaming and interactive behavior?
- How should hardware contracts be represented before a SystemRDL adapter exists?
- When should a requirement-owned contract become a shared contract binding?

## Semantic layer

- Which RDF/SHACL toolchain best balances determinism, performance, and Bun/TypeScript integration?
- How much OWL reasoning is safe and useful by default?
- How should external vocabularies be vendored and updated without breaking determinism?
- How should concept schemes and structural ontologies stay separate without duplicating glossary terms?
- Which semantic constraints should be mandatory for certain requirement classes?

## Capabilities and verification

- Should capabilities be derived from product features, operational abilities, or system boundaries?
- Which verification methods should be mandatory for each requirement class?
- How should coverage roll up across capability, requirement, and verification layers without hiding gaps?
- When is inspection or demonstration sufficient evidence instead of a waiver?

## Query, MCP, Explorer, and workbench

- What is the stable JSON schema for the unified graph query?
- Should MCP expose prompts, tools, or both for each workflow?
- Which authentication model is appropriate for local-only MCP and Explorer access?
- What must a separate decision require before mutation of approved content over MCP or Explorer is allowed?
- How should the workbench represent large graphs without a direct-manipulation library?
- Which second interactive operation needs a full before/after graph simulation?

## Presentation and identity

- How should `ref` handles be scoped and invalidated across graph versions and sessions?
- How should default-output leak tests detect internal ID prefixes without false positives?
- Should technical details be available in chat by default, or only after an explicit request?
- How should named approval scopes resolve when two items share a title?
- What context-pack size keeps chat useful without dumping source prose?
- How should the workbench present confidence without implying approval?

## Workspace and lifecycle

- Should multi-repo support use a native manifest, Git submodules, or both?
- How should branch contexts be named and selected when several models are loaded?
- What is the minimum migration fixture set for a stable model version?
- How should approval hashes survive a pin update with unchanged component content?

## Implementation preflight

- Should `spec init --existing` detect package scripts, or only scaffold the configuration README?
- Should compiler failures be waivable, and under what scope and expiry?
- How should diagnostics be normalized across languages without hiding actionable detail?
- Should `spec doctor` resolve arbitrary configured executables, or leave that to `spec check`?
- When should the audit bundle regenerate compiler evidence instead of approval?
- Should the adapter accept multiple named implementation adapters later?

## Agent workflow

- How should the read-only unified MCP server relate to the native LikeC4, StrictDoc, and Quint tools?
- How should the agent query evidence without reading large logs?
- What is the minimum permission model that remains portable across agent tools?
- Which spec operations belong in the plugin tool surface instead of MCP?
- How should the plugin stay compatible with the installed opencode API across versions?
- How should same-worktree proposals handle two concurrent planning sessions?
- How should the plugin detect and record a decision that was only stated in chat?

## Adoption

- How long should a feature slice take to author in practice?
- Which parts of the full-stack setup can be cached or prebuilt?
- Should `spec init --existing` modify CI configuration automatically or only propose it?

## Evaluation

- Which real projects provide the best fixtures for each adapter?
- What is the baseline for review time before the framework?
- How should spec quality be measured without vanity metrics?
