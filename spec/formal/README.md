# Formal models

Quint modules live here. Every approved behavioral requirement must link to a
property or action in one of these modules, or carry a human-approved waiver.

Run:

```bash
quint typecheck spec/formal/*.qnt
quint verify spec/formal/*.qnt --invariant <property>
```
