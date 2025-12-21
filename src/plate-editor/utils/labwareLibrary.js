import YAML from 'yaml'

const DEFAULT_LIBRARY_PATH = 'spec/labware/library.yaml'

export async function loadLabwareLibrary(repoConnection, path = DEFAULT_LIBRARY_PATH) {
  if (!repoConnection?.readFile) {
    throw new Error('Repository connection is not ready.')
  }
  const raw = await safeReadFile(repoConnection, path)
  const parsed = YAML.parse(raw || '') || []
  if (!Array.isArray(parsed)) return []
  return parsed
}

export function labwareMap(entries = []) {
  const map = new Map()
  entries.forEach((entry) => {
    if (entry?.id) {
      map.set(entry.id, entry)
    }
  })
  return map
}

export function resolveLabwareLayout(entry = null) {
  if (!entry || typeof entry !== 'object') return null
  const layout = entry.layout || {}
  const rows = Number(layout.rows) || undefined
  const columns = Number(layout.columns) || undefined
  const wellKeying = layout.wellKeying || 'A01'
  const kind = normalizeKind(entry.kind, rows, columns)
  const normalized = {
    kind,
    wellKeying
  }
  if (rows && columns) {
    normalized.dimensions = { rows, columns }
  }
  return normalized
}

function normalizeKind(kind, rows, columns) {
  if (kind === 'plate' || !kind) {
    if (rows && columns) {
      const wellCount = rows * columns
      // Map well counts to specific plate types
      if (wellCount === 6) return 'plate6'
      if (wellCount === 12) return 'plate12'
      if (wellCount === 24) return 'plate24'
      if (wellCount === 48) return 'plate48'
      if (wellCount === 96) return 'plate96'
      if (wellCount === 384) return 'plate384'
      // For other well counts, try to infer from dimensions
      if (wellCount > 96) return 'plate384'
    }
    return 'plate96'
  }
  if (kind === 'tubeset') {
    // Tubeset is single-row, so columns determine the type
    if (rows === 1 && columns) {
      if (columns === 6) return 'tubeset6'
      if (columns === 8) return 'tubeset8'
      if (columns === 12) return 'tubeset12'
    }
    return 'tubeset12' // Default tubeset
  }
  if (kind === 'reservoir') {
    // Reservoir is single-row, columns determine the count
    // But we want to display vertically, so swap in the preset
    if (rows === 1 && columns) {
      if (columns === 8) return 'reservoir8'
      if (columns === 12) return 'reservoir12'
    }
    return 'reservoir12' // Default reservoir
  }
  return kind
}

async function safeReadFile(repoConnection, path) {
  try {
    return await repoConnection.readFile(path)
  } catch (err) {
    // Try with leading slash as a fallback
    if (!path.startsWith('/')) {
      try {
        return await repoConnection.readFile(`/${path}`)
      } catch {
        // ignore
      }
    }
    return ''
  }
}
