// MOD-EXAMPLE
module example {
  var count: int
  action init = count' = 0
  action step = count' = count + 1
  // PROP-EXAMPLE-NO-NEGATIVE
  val noNegative = count >= 0
}
