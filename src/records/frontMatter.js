import YAML from 'yaml'

const FRONTMATTER_DELIMITER = /^---\s*$/m

export function parseFrontMatter(rawText = '') {
  const trimmed = rawText || ''
  if (!trimmed.trim()) {
    return { data: {}, body: '' }
  }

  // Support legacy front matter blocks (`--- yaml ---` + markdown body)
  const lines = trimmed.split(/\r?\n/)
  if (lines.length >= 2 && FRONTMATTER_DELIMITER.test(lines[0])) {
    let delimiterIndex = -1
    for (let i = 1; i < lines.length; i++) {
      if (FRONTMATTER_DELIMITER.test(lines[i])) {
        delimiterIndex = i
        break
      }
    }

    if (delimiterIndex !== -1) {
      const yamlSource = lines.slice(1, delimiterIndex).join('\n')
      let data = {}
      try {
        data = YAML.parse(yamlSource) || {}
      } catch (err) {
        console.warn('[FrontMatter] Failed to parse YAML front matter', err)
        data = {}
      }
      const body = lines.slice(delimiterIndex + 1).join('\n').replace(/^\n+/, '')
      return { data, body }
    }
  }

  let data = {}
  try {
    data = YAML.parse(trimmed) || {}
  } catch (err) {
    console.warn('[FrontMatter] Failed to parse YAML record', err)
    data = {}
  }

  return { data, body: '' }
}

export function serializeFrontMatter(data = {}, body = '') {
  // Ignore body content; the record is pure YAML now.
  return YAML.stringify(data || {})
}
