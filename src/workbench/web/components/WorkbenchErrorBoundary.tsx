import { Component, type ReactNode } from "react"

export class WorkbenchErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="error-panel" role="alert">
          <p>The workbench hit an unexpected display error.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload workbench
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
