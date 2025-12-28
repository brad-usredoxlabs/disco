import { ref } from 'vue'
import YAML from 'yaml'

const DEFAULT_REVISION_DIR = '/vocab/material-revisions'

export function useMaterialRevisions(repoConnection, options = {}) {
  const revisions = ref([])
  const status = ref('idle')
  const error = ref('')
  const lastLoadedAt = ref(null)

  async function loadRevisions() {
    if (!repoConnection?.directoryHandle?.value) {
      revisions.value = []
      status.value = 'idle'
      error.value = ''
      return []
    }
    status.value = 'loading'
    error.value = ''
    const dir = options.revisionDir || DEFAULT_REVISION_DIR
    try {
      const entries = await repoConnection.listDir(dir)
      const files = entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith('.yaml'))
      const loaded = []
      for (const file of files) {
        try {
          const text = await repoConnection.readFile(file.path)
          const parsed = YAML.parse(text) || {}
          loaded.push({ ...parsed, __path: file.path })
        } catch (err) {
          console.warn('[MaterialRevisions] Failed to read', file.path, err)
        }
      }
      revisions.value = loaded
      lastLoadedAt.value = new Date()
      status.value = 'ready'
      return loaded
    } catch (err) {
      error.value = err?.message || 'Failed to load material revisions.'
      status.value = 'error'
      revisions.value = []
      return []
    }
  }

  return {
    revisions,
    status,
    error,
    lastLoadedAt,
    loadRevisions
  }
}
