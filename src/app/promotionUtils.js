export function promoteEvents(events = [], labwareMap = {}, volumeParam = null) {
  return events
    .filter((evt) => evt && evt.event_type)
    .map((evt) => {
      if (evt.event_type !== 'transfer') {
        return {
          event_type: evt.event_type,
          label: evt.label || evt.event_type,
          notes: evt.notes || '',
          details: { ...evt.details, timestamp: undefined }
        }
      }
      const details = evt.details || {}
      const sourceRole = resolveRole(details.source?.labware, labwareMap, details.source_role)
      const targetRole = resolveRole(details.target?.labware, labwareMap, details.target_role)
      const mapping = Array.isArray(details.mapping) && details.mapping.length ? details.mapping : mappingFromTarget(details.target)
      return {
        event_type: 'transfer',
        label: evt.label || 'Transfer',
        notes: evt.notes || '',
        details: {
          type: 'transfer',
          source_role: sourceRole || 'source_role',
          target_role: targetRole || 'target_role',
          mapping,
          mapping_spec: details.mapping_spec || null,
          volume: volumeParam ? `\${${volumeParam}}` : details.volume || ''
        }
      }
    })
}

export function mappingFromTarget(target = {}) {
  if (!target?.wells || typeof target.wells !== 'object') return []
  return Object.keys(target.wells).map((well) => ({
    source_well: well,
    target_well: well
  }))
}

export function resolveRole(labwareRef, map, fallbackRole) {
  const id = labwareRef?.['@id'] || labwareRef
  const entry = Object.entries(map || {}).find(([_role, labId]) => labId === id)
  if (entry) return entry[0]
  return fallbackRole || ''
}

export function buildProtocolFrontmatter(runData, promotedEvents, family, version, title, labwareMap) {
  const labwareRoles = Object.entries(labwareMap || {}).reduce((acc, [role]) => {
    acc[role] = { plate_type: 'plate96' }
    return acc
  }, {})
  return {
    metadata: {
      recordType: 'protocol',
      title: title || runData?.metadata?.title || 'Promoted protocol'
    },
    data: {
      operations: {
        family: family || runData?.operations?.family || '',
        version: version || runData?.operations?.version || '0.1.0',
        parametersSchema: {},
        labwareRoles,
        events: promotedEvents
      }
    }
  }
}
