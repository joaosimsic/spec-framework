export interface ScannedFile {
  path: string
  absolutePath: string
  language: string
  hash: string
  size: number
  lineCount: number
  modifiedAt: string
}

export interface ScanWarning {
  code: string
  path: string
  message: string
}

export interface ScanResult {
  files: ScannedFile[]
  warnings: ScanWarning[]
}

export interface DirectoryEntry {
  name: string
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

export interface PendingDirectory {
  directory: string
  path: string
}
