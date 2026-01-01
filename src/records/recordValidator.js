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

  function getSchema(kind) {
    const bundle = schemaLoader.schemaBundle?.value
    if (!bundle?.recordSchemas?.[kind]) {
      return null
    }

    const key = `${kind}:${bundle.schemaSet}`
    if (cache.value.has(key)) {
      return cache.value.get(key)
    }

    try {
      const schema = buildZodSchema(bundle.recordSchemas[kind], {
        schemas: bundle.recordSchemas
      })
      cache.value.set(key, schema)
      return schema
    } catch (err) {
      console.warn('[RecordValidator] Failed to build schema', err)
      return null
    }
  }

  function validate(kind, data) {
    if (!kind) {
      return { ok: false, issues: ['Missing record kind'] }
    }
    const schema = getSchema(kind)
    if (!schema) {
      return { ok: false, issues: [{ path: 'root', message: `No schema registered for kind "${kind}".` }] }
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
