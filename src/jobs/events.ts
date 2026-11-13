import type { JobEvent, JobEventType } from "./types"

type JobEventListener = (event: JobEvent) => void

const TERMINAL: JobEventType[] = ["completed", "failed", "cancelled"]

export class JobEventBus {
  private readonly history = new Map<string, JobEvent[]>()
  private readonly listeners = new Map<string, Set<JobEventListener>>()

  publish(event: JobEvent): void {
    const events = this.history.get(event.job_id) ?? []
    events.push(event)
    this.history.set(event.job_id, events)

    for (const listener of this.listeners.get(event.job_id) ?? []) listener(event)
  }

  historyFor(jobId: string): JobEvent[] {
    return [...(this.history.get(jobId) ?? [])]
  }

  subscribe(jobId: string, listener: JobEventListener): () => void {
    const listeners = this.listeners.get(jobId) ?? new Set<JobEventListener>()
    listeners.add(listener)
    this.listeners.set(jobId, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(jobId)
    }
  }

  static terminal(event: JobEvent): boolean {
    return TERMINAL.includes(event.type)
  }
}
