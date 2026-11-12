// MOD-SPEC-CHECK
module check {
  type Record = str

  var examined: Set[Record]
  var invalid: Set[Record]
  var reported: Set[Record]

  action init = all {
    examined' = Set(),
    invalid' = Set(),
    reported' = Set(),
  }

  action observeValid(record: Record): bool = all {
    examined' = examined.union(Set(record)),
    invalid' = invalid,
    reported' = reported,
  }

  action observeInvalid(record: Record): bool = all {
    examined' = examined.union(Set(record)),
    invalid' = invalid.union(Set(record)),
    reported' = reported.union(Set(record)),
  }

  action step = any {
    observeValid("valid"),
    observeInvalid("invalid"),
  }

  // PROP-CHECK-001
  val everyInvalidRecordReported = invalid.subseteq(reported)
}
