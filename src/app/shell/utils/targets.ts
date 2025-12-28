// Stateless helpers for reading/clearing shell URL targets.
// These mirror the current AppShell behavior and will be populated during extraction phases.

export function readTargetFromSearch(params: URLSearchParams, key: string) {
  if (!params.has(key)) return null
  return decodeURIComponent(params.get(key) || '')
}

export function clearTargetFromUrl(keys: string[]) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  keys.forEach((key) => url.searchParams.delete(key))
  window.history.replaceState({}, '', url.toString())
}
