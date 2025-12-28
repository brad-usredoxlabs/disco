// Dev-only guard to prevent reintroducing deprecated materials.lab.yaml usage.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const legacyPatterns = [/materials\.lab\.yaml/i, /vocab="?materials\.lab"?/i]

  const containsLegacyMarker = (message = '') => legacyPatterns.some((re) => re.test(message))

  window.addEventListener('unhandledrejection', (event) => {
    const message = event?.reason?.message || String(event?.reason || '')
    if (containsLegacyMarker(message)) {
      // eslint-disable-next-line no-console
      console.error('🚨 LEGACY CODE DETECTED: materials.lab.yaml reference found!', message)
    }
  })

  window.addEventListener('error', (event) => {
    const message = event?.message || ''
    if (containsLegacyMarker(message)) {
      // eslint-disable-next-line no-console
      console.error('🚨 LEGACY CODE DETECTED: materials.lab.yaml reference found!', message)
    }
  })
}
