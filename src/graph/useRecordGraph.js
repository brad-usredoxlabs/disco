import { ref, watch } from 'vue'
import { buildRecordGraph } from './buildRecordGraph'

export function useRecordGraph(repoConnection, schemaLoader) {
  const status = ref('idle')
  const error = ref('')
  const graph = ref({ nodes: [], nodesById: {}, nodesByPath: {}, stats: { total: 0 } })

  async function rebuild() {
    if (!repoConnection.directoryHandle.value || !schemaLoader.schemaBundle?.value) {
      graph.value = { nodes: [], nodesById: {}, nodesByPath: {}, stats: { total: 0 } }
      status.value = 'idle'
      return
    }
    status.value = 'building'
    error.value = ''
    try {
      graph.value = await buildRecordGraph(repoConnection, schemaLoader.schemaBundle.value)
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

  watch(
    () => repoConnection.directoryHandle.value,
    (handle) => {
      if (handle) {
        rebuild()
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
        rebuild()
      }
    }
  )

  repoConnection.on?.('fs:write', () => {
    if (status.value === 'ready') {
      rebuild()
    }
  })

  return {
    graph,
    status,
    error,
    rebuild
  }
}
