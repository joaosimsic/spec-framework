export function health(): string {
  return "ok"
}

export function register(server: { get(path: string, handler: () => string): void }): void {
  server.get("/health", health)
}
