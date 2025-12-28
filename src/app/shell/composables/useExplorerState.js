import { ref, reactive, computed, watch } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../../../records/frontMatter'
import { resolveLayoutIndex } from '../../../plate-editor/utils/layoutResolver'

/**
 * Manages Lab Event Graph Explorer state and operations
 * 
 * Handles:
 * - Loading run data and plate events
 * - Explorer form state for appending events
 * - Quick transfer event creation
 * - Using runs as source for palette
 */
export function useExplorerState(repo, explorerTarget, schemaLoader, fallbackLayout) {
  // State
  const explorerState = reactive({
    events: [],
    labwareId: '',
    layoutIndex: null,
    status: '',
    error: '',
    activities: [],
    runFrontmatter: null,
    runBody: ''
  })

  const explorerForm = reactive({
    activityId: '',
    sourceWell: '',
    targetWell: '',
    volume: '',
    materialId: '',
    status: '',
    error: ''
  })

  const explorerFilePath = ref('')
  const explorerLabwareId = ref('')
  const showExplorerModal = ref(false)
  const explorerSelectedRun = ref(null)
  const explorerSelectedLabware = ref('')

  // Computed
  const canAppendExplorerEvent = computed(() => {
    return (
      explorerForm.activityId &&
      explorerForm.sourceWell.trim() &&
      explorerForm.targetWell.trim() &&
      explorerForm.volume.trim() &&
      explorerTarget.value?.path
    )
  })

  // Functions
  async function loadExplorerData() {
    if (!explorerTarget.value || !repo.directoryHandle.value || repo.isRestoring.value) return
    if (!explorerTarget.value.path) return
    explorerState.status = 'Loading…'
    explorerState.error = ''
    try {
      const raw = await repo.readFile(explorerTarget.value.path)
      const { data, body } = parseFrontMatter(raw)
      const events = await collectPlateEvents(data)
      explorerState.events = events
      explorerState.activities = Array.isArray(data.activities) ? data.activities : data.operations?.activities || []
      explorerState.runFrontmatter = data
      explorerState.runBody = body || ''
      explorerState.labwareId =
        explorerTarget.value.labware ||
        resolveLabwareFromEvents(events) ||
        resolveLabwareFromActivities(explorerState.activities) ||
        'plate/UNKNOWN'
      explorerSelectedRun.value = data?.metadata?.recordId || data?.metadata?.id || ''
      explorerSelectedLabware.value = explorerState.labwareId
      explorerState.layoutIndex = fallbackLayout.value
      explorerState.status = events.length ? '' : 'No PlateEvents found in run.'
    } catch (err) {
      explorerState.error = err?.message || 'Failed to load run for explorer.'
      explorerState.events = []
      explorerState.activities = []
    }
  }

  async function collectPlateEvents(data = {}) {
    const events = []
    const activities = data.activities || data.operations?.activities || []
    activities.forEach((act) => {
      if (Array.isArray(act?.plate_events)) {
        events.push(...act.plate_events)
      }
    })
    if (!events.length && Array.isArray(data.operations?.events)) {
      events.push(...data.operations.events)
    }
    if (!events.length) {
      const layoutPath = data.operations?.plateLayout || (Array.isArray(data.operations?.plateLayouts) && data.operations.plateLayouts[0])
      if (layoutPath && repo?.readFile) {
        try {
          const rawLayout = await repo.readFile(layoutPath)
          const { data: layoutData } = parseFrontMatter(rawLayout)
          const layoutEvents = layoutData?.operations?.events || []
          events.push(...layoutEvents)
          explorerState.status = 'Loaded events from plate layout.'
        } catch (err) {
          console.warn('Failed to read plate layout for events', err)
        }
      }
    }
    return events
  }

  function resolveLabwareFromEvents(events = []) {
    for (const evt of events) {
      if (Array.isArray(evt?.labware) && evt.labware.length) {
        const entry = evt.labware.find((l) => l?.['@id']) || evt.labware[0]
        if (entry?.['@id']) return entry['@id']
      }
      if (evt?.details?.target?.labware?.['@id']) return evt.details.target.labware['@id']
    }
    return ''
  }

  function resolveLabwareFromActivities(activities = []) {
    for (const act of activities) {
      if (Array.isArray(act?.plate_events)) {
        const id = resolveLabwareFromEvents(act.plate_events)
        if (id) return id
      }
    }
    return ''
  }

  function resetExplorerForm() {
    explorerForm.activityId = ''
    explorerForm.sourceWell = ''
    explorerForm.targetWell = ''
    explorerForm.volume = ''
    explorerForm.materialId = ''
    explorerForm.status = ''
    explorerForm.error = ''
  }

  async function appendExplorerEvent() {
    if (!canAppendExplorerEvent.value || !explorerState.runFrontmatter || !explorerTarget.value?.path) return
    explorerForm.status = 'Saving…'
    explorerForm.error = ''
    try {
      const fm = JSON.parse(JSON.stringify(explorerState.runFrontmatter || {}))
      const data = fm.data || {}
      const activities = Array.isArray(data.activities) ? data.activities : data.operations?.activities || []
      const idx = activities.findIndex((a) => a.id === explorerForm.activityId)
      if (idx === -1) throw new Error('Activity not found on run.')
      activities[idx].plate_events ||= []
      const event = buildQuickTransferEvent(explorerForm, fm)
      activities[idx].plate_events.push(event)
      data.activities = activities
      fm.data = data
      const serialized = serializeFrontMatter(fm, explorerState.runBody || '')
      await repo.writeFile(explorerTarget.value.path, serialized)
      explorerForm.status = 'Event appended.'
      await loadExplorerData()
    } catch (err) {
      explorerForm.error = err?.message || 'Failed to append event.'
    }
    explorerForm.saving = false
  }

  function buildQuickTransferEvent(form, fm = {}) {
    const runId = fm.metadata?.id || fm.metadata?.recordId || fm.metadata?.runId || ''
    const labwareId = explorerState.labwareId || 'plate/UNKNOWN'
    const timestamp = new Date().toISOString()
    return {
      id: `evt-${Date.now()}`,
      event_type: 'transfer',
      timestamp,
      run: runId,
      labware: [{ '@id': labwareId, kind: 'plate' }],
      details: {
        type: 'transfer',
        source: {
          labware: { '@id': labwareId, kind: 'plate' },
          wells: {
            [form.sourceWell.trim()]: {}
          }
        },
        target: {
          labware: { '@id': labwareId, kind: 'plate' },
          wells: {
            [form.targetWell.trim()]: {
              well: form.targetWell.trim(),
              material_id: form.materialId?.trim() || ''
            }
          }
        },
        mapping: [
          {
            source_well: form.sourceWell.trim(),
            target_well: form.targetWell.trim(),
            volume: form.volume.trim()
          }
        ],
        volume: form.volume.trim(),
        material: form.materialId?.trim() ? { id: form.materialId.trim() } : null
      }
    }
  }

  async function handleExplorerOpen() {
    if (!explorerFilePath.value) return
    const bundle = schemaLoader.selectedBundle?.value
    const url = new URL(window.location.href)
    url.searchParams.delete('explorerPath')
    url.searchParams.delete('explorerBundle')
    url.searchParams.delete('explorerLabware')
    url.searchParams.set('explorerPath', explorerFilePath.value)
    if (bundle) url.searchParams.set('explorerBundle', bundle)
    if (explorerLabwareId.value) url.searchParams.set('explorerLabware', explorerLabwareId.value)
    explorerTarget.value = {
      path: explorerFilePath.value,
      bundle,
      labware: explorerLabwareId.value
    }
    window.history.replaceState({}, '', url.toString())
    loadExplorerData()
    showExplorerModal.value = false
  }

  function handleUseRunAsSource(payload, runEditorRef, runOptions, openRunEditorWith) {
    const runId = payload.runId || explorerSelectedRun.value || ''
    if (!runId) return
    const labwareId =
      payload.labwareId ||
      explorerSelectedLabware.value ||
      explorerTarget.value?.labware ||
      resolveLabwareFromEvents(explorerState.events) ||
      ''
    const runNode = runOptions.value.find((node) => node.id === runId)
    const path = payload.path || runNode?.path || explorerTarget.value?.path || ''
    const label = payload.label || labwareId || runId
    
    const pendingPaletteAdd = { runId, labwareId, label }
    
    // If run editor already loaded, add immediately
    if (runEditorRef.value?.store) {
      runEditorRef.value.store.addRunDerivedPaletteEntry({
        runId,
        labwareId,
        label,
        layoutIndex: resolveLayoutIndex({}, { fallbackKind: 'plate96' })
      })
      return null // No pending add needed
    }
    
    // Otherwise open the run editor on the run
    if (path) {
      const bundle = payload.bundle || explorerTarget.value?.bundle || schemaLoader.selectedBundle?.value
      openRunEditorWith(path, bundle)
    }
    
    return pendingPaletteAdd
  }

  // Watchers
  watch(
    () => showExplorerModal.value,
    (open, _, onCleanup) => {
      // This would need activeRecordPath passed in if we want the prefill behavior
      // For now, keeping it simple
    }
  )

  return {
    // State
    explorerState,
    explorerForm,
    explorerFilePath,
    explorerLabwareId,
    showExplorerModal,
    explorerSelectedRun,
    explorerSelectedLabware,

    // Computed
    canAppendExplorerEvent,

    // Functions
    loadExplorerData,
    collectPlateEvents,
    resolveLabwareFromEvents,
    resolveLabwareFromActivities,
    resetExplorerForm,
    appendExplorerEvent,
    buildQuickTransferEvent,
    handleExplorerOpen,
    handleUseRunAsSource
  }
}
