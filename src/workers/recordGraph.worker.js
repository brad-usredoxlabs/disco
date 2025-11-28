import { buildGraphSnapshot } from '../graph/graphBuilder'

const pending = new Map()

self.addEventListener('message', async (event) => {
  const { requestId, files, schemaBundle } = event.data || {}
  if (!requestId) return
  try {
    const graph = buildGraphSnapshot(files || [], schemaBundle || {})
    self.postMessage({ requestId, result: graph })
  } catch (err) {
    self.postMessage({ requestId, error: err?.message || String(err) })
  }
})
