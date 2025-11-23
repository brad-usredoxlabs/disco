import { parseFrontMatter, serializeFrontMatter } from './frontMatter'

export function sanitizeSlug(value = '') {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

export function applyFilenamePattern(pattern = '{{id}}.md', metadata = {}) {
  const replacements = {
    ...metadata,
    title_sanitized: metadata.title ? sanitizeSlug(metadata.title) : '',
    date: metadata.date || new Date().toISOString().slice(0, 10)
  }

  let filename = pattern.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => {
    const lookup = key.trim()
    const value = replacements[lookup]
    if (value === undefined || value === null) return ''
    return String(value)
  })

  filename = filename
    .replace(/__+/g, '_')
    .replace(/--+/g, '-')
    .replace(/^_+/, '')
    .replace(/_+(?=\.[^.]+$)/, '')

  if (!filename.toLowerCase().endsWith('.md')) {
    filename += '.md'
  }

  return filename || 'record.md'
}

export function buildDefaultFrontMatter(recordType, namingRule = {}, workflowDefinition) {
  const fm = {
    recordType,
    state: workflowDefinition?.config?.initial || 'draft',
    id: '',
    title: ''
  }

  if (namingRule?.shortSlugField) {
    fm[namingRule.shortSlugField] = ''
  }

  return fm
}

export function computeRecordPath(metadata, namingRule) {
  if (!namingRule) return ''
  const baseDir = namingRule.baseDir?.replace(/^\/+|\/+$/g, '') || ''
  const fileName = applyFilenamePattern(namingRule.filenamePattern || '{{id}}.md', {
    ...metadata,
    [namingRule.shortSlugField || 'shortSlug']: metadata[namingRule.shortSlugField || 'shortSlug']
  })
  const safeFileName = fileName || `${sanitizeSlug(metadata.shortSlug || metadata.id || metadata.title || 'record')}.md`
  return `/${baseDir}/${safeFileName}`.replace(/\/+/g, '/').replace(/\/+$/, '')
}
