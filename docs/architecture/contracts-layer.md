# Observed contracts

Generated contracts describe public surfaces visible in the repository. They do
not approve compatibility or normative API policy.

## Sources

- package `exports` and `bin` entries;
- exported TypeScript symbols and signatures;
- observed CLI entry points;
- HTTP routes grouped by route family;
- `*.schema.json` files if present;
- configured contract checks.

## Record shape

```json
{
  "id": "CON-...",
  "kind": "library_api",
  "title": "@spec-framework/cli",
  "owner": "package.json",
  "surface": ["runCheck", "runMap"],
  "evidence": [{ "kind": "source", "file": "src/cli.ts", "line": 1 }],
  "confidence": "observed"
}
```

## Current generated kinds

- `cli`;
- `http_routes`;
- `json_schema`;
- `library_api`;
- `package_exports`.

Route records use surface entries such as `GET /orders`. CLI records keep
package bin entries and observed command names distinct. JSON Schema records
include `$id`, `title`, and `$schema` values when present.

## Rules

- Generated contracts are observations.
- Missing or unresolved surfaces become unknowns.
- A contract does not claim backward or forward compatibility unless a
  configured check provides evidence.
- Contract checks are optional external evidence.
- No hand-authored contract sidecar is required.

## Optional exports

Generated contract records can be exported as JSON or Markdown. Exported files
are output only.
