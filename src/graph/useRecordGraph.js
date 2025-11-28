import { ref, watch } from 'vue'
import { collectRecordFiles } from './collectRecordFiles'
import { buildGraphSnapshot } from './graphBuilder'
import { buildRecordGraph } from './buildRecordGraph'

export function useRecordGraph(repoConnection, schemaLoader) {
  const status = ref('idle')
  const error = ref('')
  const graph = ref({ nodes: [], nodesById: {}, nodesByPath: {}, stats: { total: 0 } })
  let rebuildTimer = null
  let worker = null
  const workerQueue = new Map()

  function supportsWorker() {
    return typeof window !== 'undefined' && typeof window.Worker !== 'undefined'
  }

  function ensureWorker() {
    if (!supportsWorker()) return null
    if (worker) return worker
    worker = new Worker(new URL('../workers/recordGraph.worker.js', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event) => {
      const { requestId, result, error: workerError } = event.data || {}
      if (!requestId) return
      const resolver = workerQueue.get(requestId)
      if (!resolver) return
      workerQueue.delete(requestId)
      if (workerError) {
        resolver.reject(new Error(workerError))
      } else {
        resolver.resolve(result)
      }
    })
    worker.addEventListener('error', (err) => {
      console.warn('[RecordGraphWorker] error', err)
      workerQueue.forEach((resolver) => resolver.reject(err))
      workerQueue.clear()
      worker.terminate()
      worker = null
    })
    return worker
  }

  function buildGraphViaWorker(files, schemaBundle) {
    const activeWorker = ensureWorker()
    if (!activeWorker) {
      return Promise.reject(new Error('worker not supported'))
    }
    const requestId = `${Date.now()}-${Math.random()}`
    return new Promise((resolve, reject) => {
      workerQueue.set(requestId, { resolve, reject })
      activeWorker.postMessage({ requestId, files, schemaBundle })
    })
  }

  async function rebuild() {
    if (!repoConnection.directoryHandle.value || !schemaLoader.schemaBundle?.value) {
      graph.value = { nodes: [], nodesById: {}, nodesByPath: {}, stats: { total: 0 } }
      status.value = 'idle'
      return
    }
    status.value = 'building'
    error.value = ''
    try {
      const currentBundle = schemaLoader.schemaBundle.value
      const files = await collectRecordFiles(repoConnection, currentBundle.naming || {})
      let result
      if (files.length && supportsWorker()) {
        try {
          result = await buildGraphViaWorker(files, currentBundle)
        } catch (workerErr) {
          console.warn('[RecordGraph] worker failed, falling back.', workerErr)
          result = buildGraphSnapshot(files, currentBundle)
        }
      } else if (files.length) {
        result = buildGraphSnapshot(files, currentBundle)
      } else {
        result = await buildRecordGraph(repoConnection, currentBundle)
      }
      graph.value = result
      status.value = 'ready'
    } catch (err) {
      console.error('[RecordGraph] Failed to build graph', err)
      error.value = err?.message || 'Unable to build record graph.'
      status.value = 'error'
    }
  }

  function reset() {
    graph.value = { nodes: [], nodesById: {}, nodesByPath: {}, stats: { total: 0 } }
    status.value = 'idle'
    error.value = ''
  }

  function scheduleRebuild(delay = 200) {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer)
    }
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      rebuild()
    }, delay)
  }

  watch(
    () => repoConnection.directoryHandle.value,
    (handle) => {
      if (handle) {
        scheduleRebuild(0)
      } else {
        reset()
      }
    },
    { immediate: true }
  )

  watch(
    () => schemaLoader.schemaBundle?.value,
    (bundle) => {
      if (bundle && repoConnection.directoryHandle.value) {
        scheduleRebuild()
      }
    }
  )

  repoConnection.on?.('fs:write', () => {
    if (status.value === 'ready') {
      scheduleRebuild()
    }
  })

  return {
    graph,
    status,
    error,
    rebuild
  }
}
