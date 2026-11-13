export function status(): string {
  return "ok"
}

export function register(server: { get(path: string, handler: () => string): void }): void {
  server.get("/status", status)
}
