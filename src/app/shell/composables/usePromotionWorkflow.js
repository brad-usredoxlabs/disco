import { ref, reactive } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../../../records/frontMatter'
import { promoteEvents, buildProtocolFrontmatter } from '../../promotionUtils'
import { buildZodSchema } from '../../../records/zodBuilder'

/**
 * Manages protocol promotion workflow
 * 
 * Handles converting a run's PlateEvents into a reusable protocol template:
 * - Promotion modal state and form
 * - Labware role mapping and suggestions
 * - Event promotion and protocol generation
 * - Validation of generated protocol
 */
export function usePromotionWorkflow(repo, schemaLoader, activeRecordPath, explorerState) {
  // State
  const showPromotionModal = ref(false)
  const promotionForm = reactive({
    runPath: '',
    family: '',
    version: '0.1.0',
    title: 'Promoted protocol',
    volumeParam: '',
    labwareRows: [
      { role: 'source_role', id: 'labware:res1' },
      { role: 'target_role', id: 'plate/PLT-0001' }
    ],
    status: '',
    error: ''
  })

  // Functions
  function openPromotionModal() {
    promotionForm.runPath = activeRecordPath.value || ''
    promotionForm.status = ''
    promotionForm.error = ''
    if (!promotionForm.labwareRows.length) {
      promotionForm.labwareRows = [{ role: 'source_role', id: '' }]
    }
    prefillLabwareRowsFromRun()
    showPromotionModal.value = true
  }

  function prefillLabwareRowsFromRun() {
    if (!explorerState.activities?.length) return
    const idToKind = new Map()
    explorerState.activities.forEach((act) => {
      ;(act.plate_events || []).forEach((evt) => {
        if (Array.isArray(evt.labware)) {
          evt.labware.forEach((lw) => lw?.['@id'] && idToKind.set(lw['@id'], lw.kind || ''))
        }
        if (evt.details?.source?.labware?.['@id']) {
          idToKind.set(evt.details.source.labware['@id'], evt.details.source.labware.kind || '')
        }
        if (evt.details?.target?.labware?.['@id']) {
          idToKind.set(evt.details.target.labware['@id'], evt.details.target.labware.kind || '')
        }
      })
    })
    const existingIds = new Set(promotionForm.labwareRows.map((row) => row.id))
    const usedRoles = new Set(promotionForm.labwareRows.map((row) => row.role).filter(Boolean))
    idToKind.forEach((kind, id) => {
      if (existingIds.has(id)) return
      const suggestedRole = suggestRoleForLabware(id, kind, usedRoles)
      usedRoles.add(suggestedRole)
      promotionForm.labwareRows.push({ role: suggestedRole, id })
    })
  }

  function suggestRoleForLabware(id, kind = '', usedRoles = new Set()) {
    const lower = String(id || '').toLowerCase()
    let base = 'labware'
    if (kind === 'reservoir' || lower.includes('res')) base = 'reservoir'
    else if (kind === 'plate' || lower.includes('qpcr')) base = 'qpcr_plate'
    else if (lower.includes('plate')) base = 'plate'
    else if (lower.includes('tube')) base = 'tube_rack'
    let role = base
    let counter = 1
    while (usedRoles.has(role)) {
      role = `${base}_${counter}`
      counter += 1
    }
    return role
  }

  async function handlePromoteRun() {
    if (!promotionForm.runPath) {
      promotionForm.error = 'Select a run path.'
      return
    }
    promotionForm.status = 'Promoting…'
    promotionForm.error = ''
    try {
      const raw = await repo.readFile(promotionForm.runPath)
      const { data } = parseFrontMatter(raw)
      const events = await collectPlateEvents(data)
      if (!events.length) {
        throw new Error('No PlateEvents found in run.')
      }
      const mapping = labwareRowsToMap(promotionForm.labwareRows)
      const promotedEvents = promoteEvents(events, mapping, promotionForm.volumeParam)
      const frontmatter = buildProtocolFrontmatter(
        data,
        promotedEvents,
        promotionForm.family,
        promotionForm.version,
        promotionForm.title,
        mapping
      )
      const validation = validateProtocolFrontmatter(frontmatter)
      if (!validation.ok) {
        throw new Error(validation.issues.map((i) => `${i.path}: ${i.message}`).join(' | '))
      }
      const outPath =
        promotionForm.runPath.replace(/^08_RUNS\//, '06_PROTOCOLS/').replace(/\.(md|markdown|ya?ml)$/i, '') + '_PROMOTED.yaml'
      const serialized = serializeFrontMatter(frontmatter, '# Promoted protocol\n\nGenerated from run promotion.')
      await repo.writeFile(outPath, serialized)
      promotionForm.status = `Wrote ${outPath}`
      showPromotionModal.value = false
    } catch (err) {
      promotionForm.error = err?.message || 'Promotion failed.'
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
    return events
  }

  function labwareRowsToMap(rows = []) {
    return rows
      .filter((row) => row.role && row.id)
      .reduce((acc, row) => {
        acc[row.role.trim()] = row.id.trim()
        return acc
      }, {})
  }

  function validateProtocolFrontmatter(frontmatter) {
    const schema = schemaLoader.schemaBundle?.value?.recordSchemas?.protocol
    if (!schema) return { ok: true, issues: [] }
    try {
      const zodSchema = buildZodSchema(schema, { schemas: schemaLoader.schemaBundle.value.recordSchemas })
      const payload = {
        ...(frontmatter.metadata || {}),
        ...(frontmatter.data || {}),
        ...(frontmatter.data?.operations || {})
      }
      const result = zodSchema.safeParse(payload)
      if (result.success) return { ok: true, issues: [] }
      const issues = result.error.issues.map((issue) => ({
        path: issue.path?.length ? issue.path.join('.') : 'root',
        message: issue.message
      }))
      return { ok: false, issues }
    } catch (err) {
      return { ok: false, issues: [{ path: 'schema', message: err?.message || 'Schema build failed' }] }
    }
  }

  return {
    // State
    showPromotionModal,
    promotionForm,

    // Functions
    openPromotionModal,
    prefillLabwareRowsFromRun,
    suggestRoleForLabware,
    handlePromoteRun,
    collectPlateEvents,
    labwareRowsToMap,
    validateProtocolFrontmatter
  }
}
