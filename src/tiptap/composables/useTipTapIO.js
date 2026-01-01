import { ref } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../../records/frontMatter'
import { getParentPath, joinPath, normalizePath } from '../../fs/pathUtils'
import { composeRecordFrontMatter, extractRecordData, mergeMetadataAndFormData } from '../../records/jsonLdFrontmatter'

export function useTipTapIO(repo, validateRecord) {
  const loading = ref(false)
  const error = ref('')

  function ensureRepo() {
    if (!repo || typeof repo.readFile !== 'function' || typeof repo.writeFile !== 'function') {
      throw new Error('A connected repository is required for TipTap I/O.')
    }
  }

  function resolveSidecarPath(recordPath, sidecarName = 'body.tiptap.json') {
    const dir = getParentPath(recordPath) || '/'
    return joinPath(dir, sidecarName)
  }

  async function loadDocument(recordPath, options = {}) {
    const opts = {
      ensureExists: false,
      metadataTemplate: {},
      sidecarName: 'body.tiptap.json',
      ...options
    }

    ensureRepo()
    const normalized = normalizePath(recordPath)
    const sidecarPath = resolveSidecarPath(normalized, opts.sidecarName)
    loading.value = true
    error.value = ''

    try {
      let rawContent
      try {
        rawContent = await repo.readFile(normalized)
      } catch (err) {
        if (!opts.ensureExists) {
          throw err
        }
        return await seedRecord(normalized, sidecarPath, opts.metadataTemplate)
      }

      const { data, body } = parseFrontMatter(rawContent)
      if (validateRecord) {
        try {
          validateRecord(data || {})
        } catch (err) {
          console.warn('[TapTab] metadata validation warning:', err)
        }
      }
      let tiptapDoc
      try {
        const sidecarRaw = await repo.readFile(sidecarPath)
        tiptapDoc = JSON.parse(sidecarRaw)
      } catch {
        tiptapDoc = buildDocFromRecord(data, body)
      }

      return {
        metadata: data || {},
        body: body || '',
        tiptapDoc,
        recordPath: normalized,
        sidecarPath
      }
    } catch (err) {
      error.value = err?.message || 'Failed to load TipTap document.'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function saveDocument({
    recordPath,
    metadata = {},
    tiptapDoc,
    sidecarName = 'body.tiptap.json',
    validationRecord = null
  }) {
    if (!tiptapDoc) {
      throw new Error('Cannot save TipTap document without content.')
    }
    ensureRepo()
    const normalized = normalizePath(recordPath)
    const sidecarPath = resolveSidecarPath(normalized, sidecarName)
    loading.value = true
    error.value = ''

    try {
      const payload = { ...(metadata || {}) }
      if (validateRecord) {
        validateRecord(validationRecord || payload)
      }
      await repo.writeFile(normalized, serializeFrontMatter(payload))
      await repo.writeFile(sidecarPath, JSON.stringify(tiptapDoc, null, 2))
      return {
        recordPath: normalized,
        sidecarPath,
        body: ''
      }
    } catch (err) {
      error.value = err?.message || 'Failed to save TipTap document.'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function seedRecord(recordPath, sidecarPath, template = {}) {
    const baseMetadata = {
      state: 'draft',
      title: template.title || 'Untitled protocol',
      recordType: template.recordType || 'protocol',
      ...template
    }
    let frontMatterPayload
    let inferredType = baseMetadata.recordType || 'record'
    if (hasJsonLdShape(template)) {
      frontMatterPayload = template
      inferredType = template.metadata?.recordType || template.recordType || inferredType
    } else {
      const formData = isPlainObject(baseMetadata.formData) ? baseMetadata.formData : {}
      frontMatterPayload = composeRecordFrontMatter(inferredType, baseMetadata, formData, {})
    }
    const { metadata: hydratedMetadata, formData } = extractRecordData(inferredType, frontMatterPayload, {})
    const schemaRecord = mergeMetadataAndFormData(hydratedMetadata, formData)
    if (validateRecord) {
      validateRecord(schemaRecord)
    }
    const tiptapDoc = buildDocFromRecord(schemaRecord, '')
    await repo.writeFile(recordPath, serializeFrontMatter(frontMatterPayload))
    await repo.writeFile(sidecarPath, JSON.stringify(tiptapDoc, null, 2))
    return {
      metadata: frontMatterPayload,
      body: '',
      tiptapDoc,
      recordPath,
      sidecarPath
    }
  }

  return {
    loading,
    error,
    loadDocument,
    saveDocument,
    buildDocFromRecord,
  }
}

function hasJsonLdShape(input = {}) {
  return Boolean(input && typeof input === 'object' && (input.metadata || input.data))
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function buildDocFromRecord(metadata = {}, body = '') {
  const content = []

  if (metadata.title) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: metadata.title }]
    })
  }

  const paragraphs = splitMarkdownIntoParagraphs(body)
  paragraphs.forEach((paragraph) => {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }]
    })
  })

  if (Array.isArray(metadata.steps)) {
    metadata.steps.forEach((step, index) => {
      content.push({
        type: 'protocolStep',
        attrs: {
          stepNumber: step.stepNumber || index + 1,
          name: step.name || '',
          description: step.description || '',
          duration: step.duration || '',
          inputs: step.inputs || [],
          equipment: step.equipment || [],
          acceptanceCriteria: step.acceptanceCriteria || '',
          validationErrors: step.validationErrors || []
        }
      })
    })
  }

  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Start editing your protocol…' }]
    })
  }

  return {
    type: 'doc',
    content
  }
}

function splitMarkdownIntoParagraphs(body = '') {
  if (!body) return []
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function collectText(node) {
  if (!node) return ''
  if (node.type === 'text') {
    return node.text || ''
  }
  if (Array.isArray(node.content)) {
    return node.content.map((child) => collectText(child)).join('')
  }
  return ''
}
