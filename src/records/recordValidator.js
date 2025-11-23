import { ref, watch } from 'vue'
import { buildZodSchema } from './zodBuilder'

export function useRecordValidator(schemaLoader) {
  const cache = ref(new Map())

  watch(
    () => schemaLoader.schemaBundle?.value,
    () => {
      cache.value = new Map()
    }
  )

  function getSchema(recordType) {
    const bundle = schemaLoader.schemaBundle?.value
    if (!bundle?.recordSchemas?.[recordType]) {
      return null
    }

    const key = `${recordType}:${bundle.schemaSet}`
    if (cache.value.has(key)) {
      return cache.value.get(key)
    }

    try {
      const schema = buildZodSchema(bundle.recordSchemas[recordType], {
        schemas: bundle.recordSchemas
      })
      cache.value.set(key, schema)
      return schema
    } catch (err) {
      console.warn('[RecordValidator] Failed to build schema', err)
      return null
    }
  }

  function validate(recordType, data) {
    if (!recordType) {
      return { ok: false, issues: ['Missing record type'] }
    }
    const schema = getSchema(recordType)
    if (!schema) {
      return { ok: false, issues: [{ path: 'root', message: `No schema registered for record type "${recordType}".` }] }
    }

    const result = schema.safeParse(data)
    if (result.success) {
      return { ok: true, issues: [] }
    }

    const issues = result.error.issues.map((issue) => ({
      path: issue.path?.length ? issue.path.join('.') : 'root',
      message: issue.message
    }))
    return { ok: false, issues }
  }

  return { validate }
}
