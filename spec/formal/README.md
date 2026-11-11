# Formal models

Quint modules live here. Every approved behavioral requirement must link to a
property or action in one of these modules, or carry a human-approved waiver.

Annotate the module and each top-level property or invariant:

```quint
// MOD-EXAMPLE
module example {
  // PROP-EXAMPLE-NO-NEGATIVE
  val noNegative = count >= 0
}
```

`spec query` reads these annotations. Unannotated declarations produce
`FORMAL-UNANNOTATED` findings instead of guessed IDs.

Run:

```bash
quint typecheck spec/formal/*.qnt
quint verify spec/formal/*.qnt --invariant <property>
```
