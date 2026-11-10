# Open questions

## Bundle

- Can StrictDoc HTML/PDF embed LikeC4 views and Quint literate sections cleanly, or is a Typst/Pandoc assembly step required?
- Which PDF path is most reproducible: StrictDoc HTML2PDF, LaTeX, or Typst?
- Should the HTML bundle be a single page, a static site, or StrictDoc's export plus linked views?

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

## Agent workflow

- Should a unified spec MCP server replace separate LikeC4/StrictDoc/Quint access?
- How should the agent query evidence without reading large logs?
- What is the minimum permission model that remains portable across agent tools?

## Adoption

- How long should a feature slice take to author in practice?
- Which parts of the full-stack setup can be cached or prebuilt?
- Should `spec init --existing` modify CI configuration automatically or only propose it?

## Evaluation

- Which real projects provide the best fixtures for each adapter?
- What is the baseline for review time before the framework?
- How should spec quality be measured without vanity metrics?
