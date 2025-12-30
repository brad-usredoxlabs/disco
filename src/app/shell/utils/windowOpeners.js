/**
 * Window opener utilities for standalone editors
 * 
 * These functions open standalone editor windows with appropriate URL parameters.
 * Each editor can be opened in a new browser window/tab with its own URL state.
 */

/**
 * Opens a TipTap editor window for a specific record
 * @param {string} path - Record file path
 * @param {string} recordType - Record type (e.g., 'study', 'run')
 * @param {string} [bundle] - Optional schema bundle name
 */
export function openTipTapWindow(path, recordType, bundle) {
  if (!path || !recordType) return
  if (typeof window === 'undefined') return
  
  const url = new URL(window.location.href)
  url.searchParams.delete('tiptapPath')
  url.searchParams.delete('tiptapType')
  url.searchParams.delete('tiptapBundle')
  url.searchParams.set('tiptapPath', path)
  url.searchParams.set('tiptapType', recordType)
  if (bundle) {
    url.searchParams.set('tiptapBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

/**
 * Opens a Plate Editor window for a plate layout
 * @param {string} path - Plate layout file path
 * @param {string} [bundle] - Optional schema bundle name
 */
export function openPlateEditorWindow(path, bundle) {
  if (!path) return
  if (typeof window === 'undefined') return
  
  const url = new URL(window.location.href)
  url.searchParams.delete('plateEditorPath')
  url.searchParams.delete('plateEditorBundle')
  url.searchParams.set('plateEditorPath', path)
  if (bundle) {
    url.searchParams.set('plateEditorBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

/**
 * Opens a Protocol Editor window for a protocol
 * @param {string} path - Protocol file path
 * @param {string} [bundle] - Optional schema bundle name
 */
export function openProtocolEditorWindow(path, bundle) {
  if (!path) return
  if (typeof window === 'undefined') return
  
  const url = new URL(window.location.href)
  url.searchParams.delete('protocolEditorPath')
  url.searchParams.delete('protocolEditorBundle')
  url.searchParams.set('protocolEditorPath', path)
  if (bundle) {
    url.searchParams.set('protocolEditorBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

/**
 * Opens a Run Editor window for a run
 * @param {string} path - Run file path
 * @param {string} [bundle] - Optional schema bundle name
 */
export function openRunEditorWindow(path, bundle) {
  if (!path) return
  if (typeof window === 'undefined') return
  
  const url = new URL(window.location.href)
  url.searchParams.delete('runEditorPath')
  url.searchParams.delete('runEditorBundle')
  url.searchParams.set('runEditorPath', path)
  if (bundle) {
    url.searchParams.set('runEditorBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

/**
 * Opens a File Inspector window for any record
 * @param {string} path - Record file path
 * @param {string} [bundle] - Optional schema bundle name
 */
export function openFileInspectorWindow(path, bundle) {
  if (!path) return
  if (typeof window === 'undefined') return
  
  const baseUrl = new URL(window.location.href)
  baseUrl.searchParams.delete('inspectorPath')
  const rootUrl = baseUrl.toString().split('?')[0]
  const targetUrl = new URL(rootUrl, window.location.href)
  targetUrl.searchParams.set('inspectorPath', path)
  if (bundle) {
    targetUrl.searchParams.set('inspectorBundle', bundle)
  }
  window.open(targetUrl.toString(), '_blank', 'noopener,noreferrer')
}
