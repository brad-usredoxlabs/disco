import { z } from 'zod'

function getFromPointer(target, pointer = '') {
  if (!pointer || pointer === '#') return target
  const path = pointer.replace(/^#\/?/, '').split('/').filter(Boolean)
  let cursor = target
  for (const segment of path) {
    if (cursor && typeof cursor === 'object' && segment in cursor) {
      cursor = cursor[segment]
    } else {
      return null
    }
  }
  return cursor
}

export function buildZodSchema(schemaNode, context) {
  const cache = new WeakMap()

  function resolveRef(ref) {
    if (ref.startsWith('#')) {
      return getFromPointer(schemaNode, ref)
    }
    if (ref.startsWith('./')) {
      const [file, pointer = ''] = ref.split('#')
      const recordName = file.replace('./', '').replace(/\.schema\.yaml$/, '').replace(/\.yaml$/, '')
      const targetSchema = context.schemas[recordName]
      if (!targetSchema) return null
      return pointer ? getFromPointer(targetSchema, `#${pointer}`) : targetSchema
    }
    return null
  }

  function fromSchema(node) {
    if (!node || typeof node !== 'object') {
      return z.any()
    }

    if (cache.has(node)) {
      return cache.get(node)
    }

    if (node.$ref) {
      const resolved = resolveRef(node.$ref)
      if (!resolved) {
        return z.any()
      }
      const schema = fromSchema(resolved)
      cache.set(node, schema)
      return schema
    }

    if (Array.isArray(node.enum)) {
      const enumValues = node.enum.map((value) => (value ?? '').toString())
      const schema = z.enum(enumValues)
      cache.set(node, schema)
      return schema
    }

    let baseSchema = null

    switch (node.type) {
      case 'object': {
        const shape = {}
        const required = new Set(node.required || [])
        for (const [key, value] of Object.entries(node.properties || {})) {
          const childSchema = fromSchema(value)
          shape[key] = required.has(key) ? childSchema : childSchema.optional()
        }
        let objectSchema = z.object(shape)
        if (node.additionalProperties === false) {
          objectSchema = objectSchema.strict()
        }
        baseSchema = objectSchema
        break
      }
      case 'array': {
        const itemSchema = fromSchema(node.items || {})
        baseSchema = z.array(itemSchema)
        break
      }
      case 'number':
      case 'integer': {
        let num = z.number()
        if (typeof node.minimum === 'number') {
          num = num.min(node.minimum)
        }
        if (typeof node.maximum === 'number') {
          num = num.max(node.maximum)
        }
        baseSchema = num
        break
      }
      case 'boolean': {
        baseSchema = z.boolean()
        break
      }
      case 'string':
      default: {
        let str = z.string()
        if (typeof node.minLength === 'number') {
          str = str.min(node.minLength)
        }
        if (typeof node.maxLength === 'number') {
          str = str.max(node.maxLength)
        }
        if (node.pattern) {
          try {
            const regex = new RegExp(node.pattern)
            str = str.regex(regex)
          } catch (err) {
            console.warn('[zodBuilder] Invalid regex pattern', node.pattern, err)
          }
        }
        baseSchema = str
        break
      }
    }

    if (!baseSchema) {
      baseSchema = z.any()
    }

    if (node.allOf?.length) {
      const merged = node.allOf
        .map(fromSchema)
        .reduce((acc, entry) => acc.merge(entry), baseSchema || z.object({}))
      baseSchema = merged
    }

    cache.set(node, baseSchema)
    return baseSchema
  }

  return fromSchema(schemaNode)
}
