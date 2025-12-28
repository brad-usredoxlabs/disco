import { ref, reactive, computed, watch } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../../../records/frontMatter'
import { resolveLayoutIndex } from '../../../plate-editor/utils/layoutResolver'

/**
 * Manages run editor state and operations
 * 
 * Handles:
 * - Run editor state (run data, material library, status)
 * - Loading run data from files
 * - Saving run changes with validation
 * - Opening run editor in standalone mode
 * - Managing pending palette additions
 */
export function useRunEditorState(
  repo,
  runEditorTarget,
  recordValidator,
  materialLibrary,
  recordGraph,
  schemaLoader
) {
  // State
  const runEditorState = reactive({
    run: null,
    body: '',
    layout: null,
    materialLibrary: [],
    status: '',
    error: ''
  })
  
  const runEditorSaving = ref(false)
  const runEditorFilePath = ref('')
  const showRunEditorModal = ref(false)
  const runEditorStandaloneRef = ref(null)
  const pendingPaletteAdd = ref(null)
  
  // Computed
  const runEditorRef = computed(() => 
    runEditorStandaloneRef.value?.runEditorRef?.value || null
  )

  // Functions
  async function loadRunEditorData() {
    if (!runEditorTarget.value || !repo.directoryHandle.value || repo.isRestoring.value) return
    if (!runEditorTarget.value.path) return
    
    runEditorState.status = 'Loading…'
    runEditorState.error = ''
    
    try {
      const raw = await repo.readFile(runEditorTarget.value.path)
      const { data, body } = parseFrontMatter(raw)
      
      runEditorState.run = data || null
      runEditorState.body = body || ''
      runEditorState.layout = null
      runEditorState.materialLibrary = Array.isArray(materialLibrary.entries.value)
        ? materialLibrary.entries.value
        : []
      runEditorState.status = ''
      
      // Apply pending palette addition if present
      if (pendingPaletteAdd.value && runEditorRef.value?.store) {
        const { runId, labwareId, label } = pendingPaletteAdd.value
        runEditorRef.value.store.addRunDerivedPaletteEntry({
          runId,
          labwareId,
          label: label || labwareId,
          layoutIndex: resolveLayoutIndex({}, { fallbackKind: 'plate96' })
        })
        pendingPaletteAdd.value = null
      }
    } catch (error) {
      runEditorState.error = error?.message || 'Failed to load run.'
      runEditorState.status = ''
      console.error('Error loading run editor data', error)
    }
  }

  async function handleRunEditorSave() {
    if (!runEditorTarget.value?.path || !repo.directoryHandle.value) return
    if (!runEditorRef.value?.store?.state?.run) return
    
    runEditorSaving.value = true
    runEditorState.status = 'Saving…'
    runEditorState.error = ''
    
    try {
      const store = runEditorRef.value.store
      const updated = store.state.run
      
      // Derive palette data if method exists
      if (typeof store.derivePaletteData === 'function') {
        store.derivePaletteData()
      }
      
      // Sanitize transfers if method exists
      if (typeof store.sanitizeTransfers === 'function') {
        store.sanitizeTransfers()
      }
      
      // Build validation payload
      const validationPayload = store.buildValidationPayload
        ? store.buildValidationPayload()
        : (typeof runEditorRef.value?.buildRunValidationPayload === 'function'
            ? runEditorRef.value.buildRunValidationPayload(updated)
            : null) || updated
      
      // Validate
      const validation = recordValidator.validate('run', validationPayload)
      if (!validation.ok) {
        runEditorState.error = `Run validation failed: ${validation.issues.map((i) => i.message).join('; ')}`
        runEditorState.status = ''
        return
      }
      
      // Save
      const text = serializeFrontMatter(updated, runEditorState.body || '')
      await repo.writeFile(runEditorTarget.value.path, text)
      runEditorState.status = 'Saved.'
    } catch (error) {
      runEditorState.error = error?.message || 'Failed to save run.'
      runEditorState.status = ''
      console.error('Run editor save error', error)
    } finally {
      runEditorSaving.value = false
    }
  }

  async function loadRunById(runId = '') {
    if (!runId || !repo?.readFile) return null
    
    const node =
      recordGraph.graph?.value?.nodesById?.[runId] ||
      recordGraph.graph?.value?.nodesById?.[runId.replace(/^run\//, '')] ||
      null
    
    if (!node?.path) return null
    
    try {
      const raw = await repo.readFile(node.path)
      const { data } = parseFrontMatter(raw)
      return data || null
    } catch (err) {
      console.warn('Failed to load run by id', runId, err)
      return null
    }
  }

  async function handleRunEditorOpen() {
    if (!runEditorFilePath.value) return
    const bundle = schemaLoader.selectedBundle?.value
    openRunEditorWith(runEditorFilePath.value, bundle)
    showRunEditorModal.value = false
  }

  function openRunEditorWith(path, bundle) {
    if (!path) return
    
    const url = new URL(window.location.href)
    url.searchParams.delete('runEditorPath')
    url.searchParams.delete('runEditorBundle')
    url.searchParams.set('runEditorPath', path)
    if (bundle) url.searchParams.set('runEditorBundle', bundle)
    
    runEditorTarget.value = {
      path,
      bundle
    }
    
    window.history.replaceState({}, '', url.toString())
    loadRunEditorData()
  }

  // Watchers
  watch(
    [() => runEditorTarget.value?.path, () => repo.directoryHandle.value],
    () => {
      loadRunEditorData()
    },
    { immediate: true }
  )

  watch(
    () => materialLibrary.entries.value,
    (entries) => {
      runEditorState.materialLibrary = Array.isArray(entries) ? entries : []
    },
    { immediate: true }
  )

  return {
    // State
    runEditorState,
    runEditorSaving,
    runEditorFilePath,
    showRunEditorModal,
    runEditorStandaloneRef,
    pendingPaletteAdd,
    runEditorRef,

    // Functions
    loadRunEditorData,
    handleRunEditorSave,
    loadRunById,
    handleRunEditorOpen,
    openRunEditorWith
  }
}
