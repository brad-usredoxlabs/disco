import YAML from 'yaml'

const FRONTMATTER_DELIMITER = /^---\s*$/m

export function parseFrontMatter(rawText = '') {
  if (!rawText.startsWith('---')) {
    return { data: {}, body: rawText }
  }

  const lines = rawText.split(/\r?\n/)
  if (lines.length < 2 || !FRONTMATTER_DELIMITER.test(lines[0])) {
    return { data: {}, body: rawText }
  }

  let delimiterIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_DELIMITER.test(lines[i])) {
      delimiterIndex = i
      break
    }
  }

  if (delimiterIndex === -1) {
    return { data: {}, body: rawText }
  }

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

export function serializeFrontMatter(data = {}, body = '') {
  const yamlText = YAML.stringify(data || {})
  const normalizedBody = body?.replace(/^[\n\r]+/, '') || ''
  return `---\n${yamlText}---\n\n${normalizedBody}`
}
