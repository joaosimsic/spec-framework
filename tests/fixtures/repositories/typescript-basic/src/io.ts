export async function save(): Promise<void> {
  await Bun.write("generated.txt", "value")
  await fetch("https://example.com")
}
