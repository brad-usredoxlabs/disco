import { computed, ref, watch } from 'vue'
import YAML from 'yaml'
import { attachLatestFeatureRevision } from './featureResolver'

const DEFAULT_SOURCES = [
  { path: '/vocab/features.index.json', optional: true },
  { dir: '/vocab/features', optional: true }
]

export function useFeatureLibrary(repoConnection, options = {}) {
  const sources = options.sources || DEFAULT_SOURCES
  const revisionDir = options.revisionDir || '/vocab/feature-revisions'
  const entries = ref([])
  const status = ref('idle')
  const error = ref('')
  const lastLoadedAt = ref(null)
  const version = ref(0)

  async function readSource(source, { optional = true } = {}) {
    if (source?.dir) {
      return readDirectorySource(source.dir, { optional })
    }
    const path = typeof source === 'string' ? source : source?.path
    if (!path) return []
    const isJson = path.endsWith('.json')
    try {
      const payload = await repoConnection.readFile(path)
      if (isJson) return JSON.parse(payload || '[]') || []
      return YAML.parse(payload) || []
    } catch (err) {
      if (optional) return []
      throw new Error(`Failed to read ${path}: ${err?.message || err}`)
    }
  }

  async function reload() {
    if (!repoConnection?.directoryHandle?.value) {
      entries.value = []
      status.value = 'idle'
      error.value = ''
      return
    }
    status.value = 'loading'
    error.value = ''
    try {
      const aggregated = []
      const seenIds = new Set()
      for (const source of sources) {
        const optional = typeof source === 'object' ? source.optional !== false : true
        const list = await readSource(source, { optional })
        list
          .filter((entry) => entry?.id)
          .forEach((entry) => {
            if (seenIds.has(entry.id)) {
              const index = aggregated.findIndex((item) => item.id === entry.id)
              aggregated.splice(index, 1, entry)
            } else {
              aggregated.push(entry)
              seenIds.add(entry.id)
            }
          })
      }

      let revisions = []
      try {
        revisions = await loadRevisionEntries(repoConnection, revisionDir)
      } catch (err) {
        console.warn('[FeatureLibrary] Failed to load revisions', err)
      }

      entries.value = attachLatestFeatureRevision(aggregated, revisions)
      lastLoadedAt.value = new Date()
      version.value += 1
      status.value = 'ready'
    } catch (err) {
      error.value = err?.message || 'Unable to load feature library.'
      status.value = 'error'
      entries.value = []
    }
  }

  const featureById = computed(() => {
    const map = {}
    entries.value.forEach((entry) => {
      map[entry.id] = entry
    })
    return map
  })

  watch(
    () => repoConnection?.directoryHandle?.value,
    (handle) => {
      if (handle) {
        reload()
      } else {
        entries.value = []
      }
    },
    { immediate: true }
  )

  if (repoConnection?.on) {
    repoConnection.on('fs:write', () => reload())
    repoConnection.on('fs:directoryNeedsRefresh', ({ path } = {}) => {
      if (typeof path === 'string' && path.includes('/vocab/')) {
        reload()
      }
    })
  }

  return {
    entries,
    featureById,
    status,
    error,
    lastLoadedAt,
    version,
    reload
  }
}

async function loadRevisionEntries(repoConnection, revisionDir) {
  if (!repoConnection?.directoryHandle?.value || !repoConnection.listDir) return []
  const entries = await repoConnection.listDir(revisionDir)
  const files = entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith('.yaml'))
  const loaded = []
  for (const file of files) {
    try {
      const text = await repoConnection.readFile(file.path)
      const parsed = YAML.parse(text) || {}
      loaded.push(parsed)
    } catch (err) {
      console.warn('[FeatureLibrary] Failed to read revision', file.path, err)
    }
  }
  return loaded
}

async function readDirectorySource(dir, { optional = true } = {}) {
  if (!repoConnection?.directoryHandle?.value || !repoConnection.listDir) return []
  try {
    const entries = await repoConnection.listDir(dir)
    const files = entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith('.yaml'))
    const loaded = []
    for (const file of files) {
      try {
        const text = await repoConnection.readFile(file.path)
        const parsed = YAML.parse(text) || {}
        loaded.push(parsed)
      } catch (err) {
        console.warn('[FeatureLibrary] Failed to read feature file', file.path, err)
      }
    }
    return loaded
  } catch (err) {
    if (optional) return []
    throw err
  }
}
