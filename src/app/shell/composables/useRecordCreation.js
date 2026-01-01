import { ref } from 'vue'

/**
 * Manages record creation workflow
 * 
 * Handles:
 * - Record creator modal state and context
 * - Post-creation actions (opening editors, linking records)
 * - Metadata patch building from relationships
 */
export function useRecordCreation(
  repo,
  recordGraph,
  searchIndex,
  relationshipsConfig,
  openProtocolEditorWindow,
  openFileInspectorWindow,
  activeRecordPath
) {
  // State
  const showCreator = ref(false)
  const creatorContext = ref(null)

  // Functions
  function openCreator(options = null) {
    creatorContext.value = options || null
    showCreator.value = true
  }

  function closeCreator() {
    showCreator.value = false
    creatorContext.value = null
  }

  async function handleRecordCreated(payload) {
    const { path, recordType } = normalizeCreationResult(payload)
    showCreator.value = false
    creatorContext.value = null
    let handled = false
    
    if (recordType === 'protocol' && path) {
      openProtocolEditorWindow(path)
      handled = true
    }
    
    if (!handled && path) {
      openFileInspectorWindow(path)
      activeRecordPath.value = path
    }
    
    recordGraph?.rebuild?.()
    searchIndex?.rebuild?.()
  }

  function normalizeCreationResult(payload) {
    if (!payload) {
      return { path: '', recordType: '', metadata: {} }
    }
    if (typeof payload === 'string') {
      return { path: payload, recordType: '', metadata: {} }
    }
    return {
      path: payload.path || '',
      recordType: payload.recordType || '',
      metadata: payload.metadata || {}
    }
  }

  function buildMetadataPatchFromNode(node) {
    if (!node) return {}
    const patch = {}
    Object.values(relationshipsConfig.value || {}).forEach((descriptor) => {
      Object.values(descriptor?.parents || {}).forEach((parentDef) => {
        if (parentDef?.recordType === node.recordType && parentDef.field) {
          patch[parentDef.field] = node.id
        }
      })
    })
    return patch
  }

  return {
    // State
    showCreator,
    creatorContext,

    // Functions
    openCreator,
    closeCreator,
    buildMetadataPatchFromNode
  }
}
