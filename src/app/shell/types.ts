// Shared shell types to keep AppShell contracts explicit during refactor.
export type BundleName = string

export interface RepoBundleServices {
  repo: unknown
  tree: unknown
  schemaLoader: unknown
  systemConfig: unknown
  offlineStatus?: unknown
}

export interface RecordServices {
  recordGraph: unknown
  searchIndex: unknown
  recordValidator: unknown
  materialLibrary: unknown
}

export interface TiptapTarget {
  path: string
  recordType: string
  bundle: BundleName
}

export interface PlateEditorTarget {
  path: string
  bundle: BundleName
}

export interface ProtocolEditorTarget {
  path: string
  bundle: BundleName
}

export interface InspectorTarget {
  path: string
  bundle: BundleName
}

export interface ExplorerTarget {
  path: string
  bundle: BundleName
  labware: string
}

export interface RunEditorTarget {
  path: string
  bundle: BundleName
}

export interface SettingsTarget {
  mode: 'settings'
}

export type StandaloneTarget =
  | TiptapTarget
  | PlateEditorTarget
  | ProtocolEditorTarget
  | InspectorTarget
  | ExplorerTarget
  | RunEditorTarget
  | SettingsTarget

export interface ShellOverlayEvent {
  type: string
  payload?: Record<string, unknown>
}
