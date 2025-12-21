export function instantiateProtocol(protocolFrontMatter = {}, options = {}) {
  const dataSections = protocolFrontMatter.data || {}
  const events = Array.isArray(dataSections.events) ? dataSections.events : []
  const labwareRoles = dataSections.labwareRoles || {}
  const labwareAssignments = options.labware || {}
  const parameters = options.parameters || {}
  const runId = options.runId || ''
  const baseTimestamp = options.timestamp || new Date().toISOString()

  return events.map((event, index) =>
    instantiateEvent(event, {
      index,
      baseTimestamp,
      runId,
      labwareRoles,
      labwareAssignments,
      parameters,
      adapters: options.adapters || {}
    })
  )
}

export function buildProtocolSegmentActivity(protocolFrontMatter = {}, options = {}) {
  const events = instantiateProtocol(protocolFrontMatter, options)
  const metadata = protocolFrontMatter.metadata || {}
  const protocolRef = {
    '@id': metadata.recordId || metadata.id || metadata['@id'] || '',
    family: metadata.family || '',
    version: metadata.version || '',
    label: metadata.title || metadata.label || ''
  }
  const activity = {
    id: options.activityId || protocolRef['@id'] || `segment-${Date.now()}`,
    kind: 'protocol_segment',
    label: options.label || protocolRef.label || activityDefaultLabel(protocolRef),
    protocol: protocolRef,
    plate_events: events
  }
  if (options.labware && Object.keys(options.labware).length) {
    activity.labware_bindings = options.labware
  }
  if (options.parameters && Object.keys(options.parameters).length) {
    activity.parameters = options.parameters
  }
  if (options.startedAt) {
    activity.started_at = options.startedAt
  }
  if (options.endedAt) {
    activity.ended_at = options.endedAt
  }
  if (options.notes) {
    activity.notes = options.notes
  }
  return activity
}

function activityDefaultLabel(protocolRef) {
  return protocolRef.label || protocolRef['@id'] || 'Protocol segment'
}

function instantiateEvent(event = {}, context = {}) {
  const timestamp = offsetTimestamp(context.baseTimestamp, context.index)
  const eventType = event.event_type || 'other'
  const label = event.label || ''
  switch (eventType) {
    case 'transfer':
      return instantiateTransfer(event, timestamp, context, label)
    case 'incubate':
      return instantiateIncubate(event, timestamp, context, label)
    case 'read':
      return instantiateRead(event, timestamp, context, label)
    case 'wash':
      return instantiateWash(event, timestamp, context, label)
    default:
      return instantiateOther(event, timestamp, context, label)
  }
}

function instantiateTransfer(event, timestamp, context, label) {
  const details = event.details || {}
  const sourceRole = details.source_role || ''
  const targetRole = details.target_role || ''
  const sourceRef = resolveLabwareRef(sourceRole, context)
  const targetRef = resolveLabwareRef(targetRole, context)

  const mapping = Array.isArray(details.mapping) ? details.mapping : []
  const sourceWells = {}
  const targetWells = {}
  mapping.forEach((entry) => {
    const sourceWell = entry?.source_well || ''
    const targetWell = entry?.target_well || ''
    if (!sourceWell || !targetWell) return
    sourceWells[sourceWell] = {
      label: sourceWell,
      well: sourceWell
    }
    targetWells[targetWell] = {
      well: targetWell
    }
  })

  return {
    id: event.id || label || `event-${timestamp}`,
    event_type: 'transfer',
    timestamp,
    run: context.runId,
    label,
    labware: dedupeLabware([sourceRef, targetRef]),
    details: {
      type: 'transfer',
      source: {
        labware: sourceRef,
        wells: sourceWells
      },
      target: {
        labware: targetRef,
        wells: targetWells
      },
      volume: resolveExpression(details.volume || '', context.parameters),
      material: cloneDeep(details.material || null),
      pipetting_hint: cloneDeep(details.pipetting_hint || null),
      notes: details.notes || event.notes || '',
      adapter_hints: buildAdapterHints(event, context)
    }
  }
}

function instantiateIncubate(event, timestamp, context, label) {
  const details = event.details || {}
  const labwareRef = resolveLabwareRef(details.labware_role, context)
  return {
    id: event.id || label || `event-${timestamp}`,
    event_type: 'incubate',
    timestamp,
    run: context.runId,
    label,
    labware: [labwareRef],
    details: {
      type: 'incubate',
      labware: labwareRef,
      wells: cloneDeep(details.wells || []),
      duration: resolveExpression(details.duration || '', context.parameters),
      temperature: resolveExpression(details.temperature || '', context.parameters),
      atmosphere: resolveExpression(details.atmosphere || '', context.parameters),
      notes: details.notes || event.notes || ''
    }
  }
}

function instantiateRead(event, timestamp, context, label) {
  const details = event.details || {}
  const labwareRef = resolveLabwareRef(details.labware_role, context)
  return {
    id: event.id || label || `event-${timestamp}`,
    event_type: 'read',
    timestamp,
    run: context.runId,
    label,
    labware: [labwareRef],
    details: {
      type: 'read',
      labware: labwareRef,
      instrument: details.instrument || '',
      mode: details.mode || '',
      channels: cloneDeep(details.channels || []),
      result_files: cloneDeep(details.result_files || []),
      notes: details.notes || event.notes || '',
      adapter_hints: buildAdapterHints(event, context)
    }
  }
}

function instantiateWash(event, timestamp, context, label) {
  const details = event.details || {}
  const labwareRef = resolveLabwareRef(details.labware_role, context)
  return {
    id: event.id || label || `event-${timestamp}`,
    event_type: 'wash',
    timestamp,
    run: context.runId,
    label,
    labware: [labwareRef],
    details: {
      type: 'wash',
      labware: labwareRef,
      wells: cloneDeep(details.wells || []),
      buffer: cloneDeep(details.buffer || null),
      cycles: resolveExpression(details.cycles ?? '', context.parameters),
      volume_per_cycle: resolveExpression(details.volume_per_cycle || '', context.parameters),
      notes: details.notes || event.notes || ''
    }
  }
}

function instantiateOther(event, timestamp, context, label) {
  const details = event.details || {}
  const labwareRef = details.labware_role ? resolveLabwareRef(details.labware_role, context) : null
  return {
    id: event.id || label || `event-${timestamp}`,
    event_type: 'other',
    timestamp,
    run: context.runId,
    label,
    labware: labwareRef ? [labwareRef] : [],
    details: {
      type: 'other',
      name: details.name || label || 'custom',
      description: details.description || event.notes || '',
      labware: labwareRef,
      metadata: cloneDeep(details.metadata || {}),
      adapter_hints: buildAdapterHints(event, context)
    }
  }
}

function cloneDeep(value) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDeep(entry))
  }
  if (typeof value === 'object') {
    const result = {}
    Object.entries(value).forEach(([key, entry]) => {
      result[key] = cloneDeep(entry)
    })
    return result
  }
  return value
}

function resolveLabwareRef(roleName, context) {
  const role = context.labwareRoles?.[roleName] || {}
  const boundId = context.labwareAssignments?.[roleName] || role.default_labware_id || `labware/${roleName}`
  return {
    '@id': boundId,
    kind: role.kind || 'plate',
    label: boundId
  }
}

function dedupeLabware(list = []) {
  const seen = new Set()
  const result = []
  list.forEach((entry) => {
    if (!entry || !entry['@id']) return
    if (seen.has(entry['@id'])) return
    seen.add(entry['@id'])
    result.push(entry)
  })
  return result
}

function offsetTimestamp(base, offset) {
  const date = new Date(base)
  if (Number.isFinite(offset)) {
    date.setSeconds(date.getSeconds() + offset)
  }
  return date.toISOString()
}

function resolveExpression(value, parameters = {}) {
  if (typeof value !== 'string') return value
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const trimmed = key.trim()
    return parameters[trimmed] ?? ''
  })
}

function buildAdapterHints(event, context) {
  const hints = {}
  const adapterConfig = context.adapters || {}
  Object.entries(adapterConfig).forEach(([adapterName, config]) => {
    if (!config || typeof config !== 'object') return
    hints[adapterName] = {
      protocolEventId: event.id || '',
      phase: event.phase || '',
      metadata: config.metadata || null
    }
  })
  return hints
}
