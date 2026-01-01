function normalizeDir(input = '') {
  if (!input) return null
  const cleaned = input.replace(/^\/+|\/+$/g, '')
  return cleaned ? `/${cleaned}` : null
}

function ensureCandidates(baseDir) {
  const normalized = normalizeDir(baseDir)
  if (!normalized) return []
  return [normalized, normalizeDir(`records/${normalized.replace(/^\//, '')}`)].filter(Boolean)
}

async function dirExists(repoConnection, path) {
  if (!path) return false
  try {
    await repoConnection.listDir(path)
    return true
  } catch {
    return false
  }
}

const RECORD_EXTENSIONS = ['.yaml', '.yml', '.md']

async function collectRecordPaths(repoConnection, baseDir) {
  const files = []

  async function walk(path) {
    let entries
    try {
      entries = await repoConnection.listDir(path)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.kind === 'directory') {
        await walk(entry.path)
      } else if (entry.kind === 'file' && RECORD_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        files.push(entry.path)
      }
    }
  }

  const candidates = ensureCandidates(baseDir)
  for (const candidate of candidates) {
    if (await dirExists(repoConnection, candidate)) {
      await walk(candidate)
    }
  }

  return files
}

export async function collectRecordFiles(repoConnection, naming = {}) {
  const records = []
  for (const [recordType, namingRule] of Object.entries(naming)) {
    if (!namingRule?.baseDir) continue
    const paths = await collectRecordPaths(repoConnection, namingRule.baseDir)
    for (const path of paths) {
      try {
        const text = await repoConnection.readFile(path)
        records.push({ path, recordType, text })
      } catch {
        /* ignore unreadable files */
      }
    }
  }
  return records
}
