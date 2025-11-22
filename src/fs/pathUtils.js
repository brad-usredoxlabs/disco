export function normalizePath(input = '/') {
  if (!input || input === '.' || input === './') {
    return '/'
  }

  const sanitized = String(input).replace(/\\/g, '/').trim()
  const hasLeadingSlash = sanitized.startsWith('/')
  const segments = []

  for (const part of sanitized.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (segments.length) {
        segments.pop()
      }
      continue
    }
    segments.push(part)
  }

  const normalized = '/' + segments.join('/')
  if (normalized === '/' && !hasLeadingSlash && sanitized.includes('./')) {
    return '/'
  }
  return normalized === '//' ? '/' : normalized
}

export function getParentPath(path) {
  const normalized = normalizePath(path)
  if (normalized === '/') return null
  const segments = normalized.split('/').filter(Boolean)
  segments.pop()
  return '/' + segments.join('/') || '/'
}

export function joinPath(...parts) {
  return normalizePath(parts.filter(Boolean).join('/'))
}