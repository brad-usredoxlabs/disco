const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomByte() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(1)
    crypto.getRandomValues(arr)
    return arr[0]
  }
  return Math.floor(Math.random() * 256)
}

function encodeTime(time, length) {
  let value = time
  let str = ''
  while (length--) {
    str = CROCKFORD[value % 32] + str
    value = Math.floor(value / 32)
  }
  return str
}

function encodeRandom(length) {
  let str = ''
  for (let i = 0; i < length; i++) {
    const rand = randomByte() % 32
    str += CROCKFORD[rand]
  }
  return str
}

export function generateUlid(now = Date.now()) {
  return encodeTime(now, 10) + encodeRandom(16)
}

export function requireNamespacing(namespacingConfig) {
  const baseIri = (namespacingConfig?.baseIri || namespacingConfig?.base_iri || '').replace(/\/+$/, '')
  const curiePrefix = namespacingConfig?.curiePrefix || namespacingConfig?.curie_prefix || ''
  if (!baseIri || !curiePrefix) {
    throw new Error('namespacing.base_iri and namespacing.curie_prefix must be set in config/system.yaml before minting assertion ids.')
  }
  return { baseIri, curiePrefix }
}

function extractAssertionKey(id, baseIri, curiePrefix) {
  if (!id) return ''
  const trimmedBase = baseIri?.replace(/\/+$/, '')
  if (trimmedBase && id.startsWith(trimmedBase)) {
    return id.split('/').pop() || ''
  }
  if (curiePrefix && id.startsWith(`${curiePrefix}:`)) {
    return id.split(':').pop() || ''
  }
  return id.split('/').pop() || id
}

export function buildAssertionIri(key, baseIri) {
  const trimmed = baseIri.replace(/\/+$/, '')
  return `${trimmed}/assertion/${key}`
}

export function normalizeAssertionId(inputId, namespacingConfig) {
  const { baseIri, curiePrefix } = requireNamespacing(namespacingConfig)
  const key = extractAssertionKey(inputId, baseIri, curiePrefix)
  if (!key) {
    throw new Error('Assertion id input is missing or invalid; provide an existing id or allow minting.')
  }
  return buildAssertionIri(key, baseIri)
}

export function mintAssertionId(namespacingConfig) {
  const { baseIri } = requireNamespacing(namespacingConfig)
  const key = generateUlid()
  return buildAssertionIri(key, baseIri)
}

export function toCurie(assertionId, namespacingConfig) {
  const { baseIri, curiePrefix } = requireNamespacing(namespacingConfig)
  const key = extractAssertionKey(assertionId, baseIri, curiePrefix)
  return `${curiePrefix}:assertion:${key}`
}

export function assertionFilename(assertionId) {
  const key = extractAssertionKey(assertionId)
  return `assertions/assertion--${key}.yaml`
}

const STORAGE_MODE = {
  RUN_EDITOR: 'embedded_in_run',
  EXPERIMENT_EDITOR: 'embedded_in_experiment',
  PROJECT_EDITOR: 'embedded_in_project',
  GLOBAL_BROWSER: 'standalone_record',
  WELL_PLATE_EDITOR: 'embedded_in_run',
  CHOOSE_CONTEXT: 'choose_context'
}

export function inferStorageMode(invokedFrom) {
  switch (invokedFrom) {
    case 'run_editor':
      return STORAGE_MODE.RUN_EDITOR
    case 'experiment_editor':
      return STORAGE_MODE.EXPERIMENT_EDITOR
    case 'project_editor':
      return STORAGE_MODE.PROJECT_EDITOR
    case 'global_assertions_browser':
      return STORAGE_MODE.GLOBAL_BROWSER
    case 'well_plate_editor':
      return STORAGE_MODE.WELL_PLATE_EDITOR
    case 'quick_add_command_palette':
    default:
      return STORAGE_MODE.CHOOSE_CONTEXT
  }
}

export function prefillScope(context = {}) {
  const scope = {}
  if (context.project) scope.project = context.project
  if (context.experiment) scope.experiment = context.experiment
  if (context.run) scope.run = context.run
  if (context.plate) scope.plate = context.plate
  if (context.well) scope.well = context.well
  if (context.acquisition) scope.acquisition = context.acquisition
  if (context.channel) scope.channel = context.channel
  return scope
}

export function shouldEmbedForScope(scope = {}) {
  return Boolean(scope.well || scope.run || scope.acquisition || scope.channel || scope.plate)
}

export function storagePlacement(invokedFrom, scope = {}) {
  const mode = inferStorageMode(invokedFrom)
  const embedPreferred = shouldEmbedForScope(scope)
  return {
    mode,
    embedRecommended: embedPreferred && mode !== STORAGE_MODE.GLOBAL_BROWSER,
    fieldName: 'assertions'
  }
}
