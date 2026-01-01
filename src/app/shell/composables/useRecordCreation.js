import { ref } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../../../records/frontMatter'

/**
 * Manages record creation workflow
 * 
 * Handles:
 * - Record creator modal state and context
 * - Post-creation actions (opening editors, linking records)
 * - Plate layout linking to runs
 * - Metadata patch building from relationships
 */
export function useRecordCreation(
  repo,
  recordGraph,
  searchIndex,
  relationshipsConfig,
  openPlateEditorWindow,
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
    const creationCtx = creatorContext.value
    const { path, recordType, metadata } = normalizeCreationResult(payload)
    showCreator.value = false
    creatorContext.value = null
    let handled = false
    
    if (recordType === 'plateLayout') {
      if (creationCtx?.parentLink?.node?.recordType === 'run') {
        await linkPlateLayoutToRun(creationCtx.parentLink.node, metadata, path)
      }
      if (path) {
        openPlateEditorWindow(path)
        handled = true
      }
    }
    
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

  async function linkPlateLayoutToRun(parentNode, childMetadata = {}, childPath = '') {
    const runPath = parentNode?.path
    const identifier = derivePlateLayoutIdentifier(childMetadata, childPath)
    if (!runPath || !identifier) return
    
    try {
      const raw = await repo.readFile(runPath)
      const { data: frontMatter = {}, body } = parseFrontMatter(raw)
      const metadataSection = frontMatter.metadata || {}
      const dataSection = frontMatter.data || {}
      const operations = { ...(dataSection.operations || {}) }
      const plateLayouts = Array.isArray(operations.plateLayouts) ? [...operations.plateLayouts] : []
      
      if (plateLayouts.includes(identifier)) {
        return
      }
      
      plateLayouts.push(identifier)
      const nextFrontMatter = {
        ...frontMatter,
        metadata: metadataSection,
        data: {
          ...dataSection,
          operations: {
            ...operations,
            plateLayouts
          }
        }
      }
      const serialized = serializeFrontMatter(nextFrontMatter, body)
      await repo.writeFile(runPath, serialized)
    } catch (err) {
      console.warn('[PlateLayouts] Unable to link run with plate layout', err)
    }
  }

  function derivePlateLayoutIdentifier(childMetadata = {}, childPath = '') {
    if (childMetadata.recordId) return childMetadata.recordId
    if (childMetadata.id) return childMetadata.id
    return inferRecordIdFromPath(childPath)
  }

  function inferRecordIdFromPath(path = '') {
    if (!path) return ''
    const fileName = path.split('/').filter(Boolean).pop() || ''
    if (!fileName) return ''
    const base = fileName.replace(/\.(md|markdown|ya?ml)$/i, '')
    return base.split('_')[0] || base
  }

  function buildPlateLayoutCreationDefaults(parentNode) {
    const titleSource =
      parentNode?.title ||
      parentNode?.frontMatter?.metadata?.title ||
      parentNode?.frontMatter?.title ||
      parentNode?.id ||
      'Run'
    return {
      title: `${titleSource} plate layout`.trim()
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
    buildPlateLayoutCreationDefaults,
    buildMetadataPatchFromNode
  }
}
