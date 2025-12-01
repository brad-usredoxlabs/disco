function unwrapRef(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value
  }
  return value
}

function getWorkflowBundle(workflowLoader) {
  if (!workflowLoader) return null
  return unwrapRef(workflowLoader.workflowBundle) || workflowLoader.workflowBundle || null
}

function getWorkflowMachines(workflowLoader) {
  const bundle = getWorkflowBundle(workflowLoader)
  return bundle?.machines || {}
}

export function resolveWorkflowConfig(workflowLoader, recordType) {
  if (!workflowLoader || !recordType) return null
  if (typeof workflowLoader.getMachine === 'function') {
    const machine = workflowLoader.getMachine(recordType)
    if (machine?.config) return machine.config
  }
  const machines = getWorkflowMachines(workflowLoader)
  return machines?.[recordType]?.config || null
}

export function resolveWorkflowState(workflowLoader, recordType, state) {
  const config = resolveWorkflowConfig(workflowLoader, recordType)
  if (!config) return { config: null, state: '' }
  const resolvedState = state || config.initial || ''
  return { config, state: resolvedState }
}

export function resolveWorkflowStateMeta(workflowLoader, recordType, state) {
  const { config, state: resolvedState } = resolveWorkflowState(workflowLoader, recordType, state)
  if (!config || !resolvedState) return null
  return config.states?.[resolvedState]?.meta || null
}

export function isWorkflowStateImmutable(workflowLoader, recordType, state) {
  const meta = resolveWorkflowStateMeta(workflowLoader, recordType, state)
  return !!meta?.immutable
}

export function workflowStateAllowsEvent(workflowLoader, recordType, state, eventName) {
  if (!eventName) return true
  const { config, state: resolvedState } = resolveWorkflowState(workflowLoader, recordType, state)
  if (!config || !resolvedState) return false
  const transitions = config.states?.[resolvedState]?.on || {}
  return Object.prototype.hasOwnProperty.call(transitions, eventName)
}
