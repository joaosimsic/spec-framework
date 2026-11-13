export function add(left: number, right: number): number {
  return left + right
}

export class Counter {
  private value = 0

  increment(): number {
    this.value += 1
    return this.value
  }
}
