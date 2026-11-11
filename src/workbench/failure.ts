export interface WorkbenchFailureChoice {
  label: string
  context: string
}

export interface WorkbenchFailure {
  code: string
  message: string
  status: number
  choices?: WorkbenchFailureChoice[]
}

export class WorkbenchFailureFactory {
  static notFound(message: string): WorkbenchFailure {
    return { code: "WORKBENCH-NOT-FOUND", message, status: 404 }
  }

  static badRequest(message: string): WorkbenchFailure {
    return { code: "WORKBENCH-BAD-REQUEST", message, status: 400 }
  }

  static conflict(message: string): WorkbenchFailure {
    return { code: "WORKBENCH-CONFLICT", message, status: 409 }
  }

  static forbiddenPath(): WorkbenchFailure {
    return { code: "WORKBENCH-FORBIDDEN", message: "asset path is not allowed", status: 403 }
  }

  static internal(message: string): WorkbenchFailure {
    return { code: "WORKBENCH-INTERNAL", message, status: 500 }
  }
}
