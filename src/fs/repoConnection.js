import { shallowRef, ref, computed } from 'vue'
import { createStore, del, get, set } from 'idb-keyval'
import { getParentPath, joinPath, normalizePath } from './pathUtils'

const DB = createStore('disco-pages-2', 'repo-access')
const HANDLE_KEY = 'root-directory-handle'

function createEventBus() {
  const listeners = new Map()

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(handler)
    return () => off(event, handler)
  }

  function off(event, handler) {
    const bucket = listeners.get(event)
    if (!bucket) return
    bucket.delete(handler)
  }

  function emit(event, payload) {
    const bucket = listeners.get(event)
    if (!bucket) return
    bucket.forEach((handler) => {
      try {
        handler(payload)
      } catch (err) {
        console.error('[RepoConnection:event]', event, err)
      }
    })
  }

  return { on, off, emit }
}

function createRepoConnection() {
  const directoryHandle = shallowRef(null)
  const error = ref('')
  const isRequesting = ref(false)
  const isRestoring = ref(true)
  const lastAction = ref('')
  const eventBus = createEventBus()

  const isSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

  const statusLabel = computed(() => {
    if (!isSupported) return 'File System Access API unavailable'
    if (directoryHandle.value) return `Connected: ${directoryHandle.value.name}`
    return 'No repository selected'
  })

  async function restoreFromCache() {
    if (!isSupported) {
      isRestoring.value = false
      return
    }

    try {
      const savedHandle = await get(HANDLE_KEY, DB)
      if (!savedHandle) {
        isRestoring.value = false
        return
      }

      const permission = await savedHandle.queryPermission({ mode: 'readwrite' })
      if (permission === 'granted') {
        directoryHandle.value = savedHandle
        lastAction.value = 'Restored session'
        eventBus.emit('repo:connected', savedHandle)
        return
      }

      await del(HANDLE_KEY, DB)
    } catch (err) {
      console.warn('Failed to restore repo handle', err)
    } finally {
      isRestoring.value = false
    }
  }

  async function requestAccess(handlePromise) {
    if (!isSupported) {
      error.value = 'File System Access API not supported in this browser.'
      return null
    }

    try {
      isRequesting.value = true
      error.value = ''
      const pickerPromise = handlePromise || window.showDirectoryPicker()
      console.info('[RepoConnection] Awaiting picker resolution…')
      const handle = await pickerPromise
      console.info('[RepoConnection] Picker resolved with handle', handle?.name)

      directoryHandle.value = handle
      await set(HANDLE_KEY, handle, DB)
      lastAction.value = 'Connected'
      eventBus.emit('repo:connected', handle)
      return handle
    } catch (err) {
      if (err?.name !== 'AbortError') {
        error.value = err?.message || 'Unable to access directory.'
      }
      return null
    } finally {
      isRequesting.value = false
      isRestoring.value = false
    }
  }

  async function disconnect() {
    directoryHandle.value = null
    await del(HANDLE_KEY, DB)
    eventBus.emit('repo:disconnected')
  }

  function ensureConnected() {
    if (!directoryHandle.value) {
      throw new Error('Repository not connected yet.')
    }
    return directoryHandle.value
  }

  async function getDirectoryHandle(path = '/', { create = false } = {}) {
    const root = ensureConnected()
    const normalized = normalizePath(path)
    if (normalized === '/') {
      return root
    }

    const segments = normalized.split('/').filter(Boolean)
    let cursor = root
    for (const segment of segments) {
      cursor = await cursor.getDirectoryHandle(segment, { create })
    }
    return cursor
  }

  async function getFileHandle(path, { create = false } = {}) {
    const normalized = normalizePath(path)
    const segments = normalized.split('/').filter(Boolean)
    if (segments.length === 0) {
      throw new Error('Cannot resolve file for repository root.')
    }
    const filename = segments.pop()
    const dir = segments.length ? '/' + segments.join('/') : '/'
    const dirHandle = await getDirectoryHandle(dir, { create })
    return { fileHandle: await dirHandle.getFileHandle(filename, { create }), dirHandle }
  }

  async function listDir(path = '/') {
    const normalized = normalizePath(path)
    const dirHandle = await getDirectoryHandle(normalized)
    const entries = []
    for await (const [name, handle] of dirHandle.entries()) {
      const kind = handle.kind || (typeof handle.getFile === 'function' ? 'file' : 'directory')
      const childPath = joinPath(normalized, name)
      entries.push({
        name,
        kind,
        path: childPath,
        handle
      })
    }
    entries.sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name)
      return a.kind === 'directory' ? -1 : 1
    })
    eventBus.emit('fs:list', { path: normalized, entries })
    return entries
  }

  async function readFile(path, { asText = true } = {}) {
    const normalized = normalizePath(path)
    const { fileHandle } = await getFileHandle(normalized)
    const file = await fileHandle.getFile()
    eventBus.emit('fs:read', { path: normalized })
    if (!asText) {
      eventBus.emit('fs:fileLoaded', { path: normalized, blob: file })
      return file
    }
    const text = await file.text()
    eventBus.emit('fs:fileLoaded', { path: normalized, text })
    return text
  }

  async function writeFile(path, contents) {
    const normalized = normalizePath(path)
    const { fileHandle } = await getFileHandle(normalized, { create: true })
    const writable = await fileHandle.createWritable()
    if (contents instanceof Blob) {
      await writable.write(contents)
    } else if (typeof contents === 'string') {
      await writable.write(contents)
    } else {
      await writable.write(JSON.stringify(contents, null, 2))
    }
    await writable.close()
    eventBus.emit('fs:write', { path: normalized })
    eventBus.emit('fs:directoryNeedsRefresh', { path: getParentPath(normalized) || '/' })
    return true
  }

  async function refreshDirectoryForPath(path) {
    const parent = getParentPath(path) || '/'
    eventBus.emit('fs:directoryNeedsRefresh', { path: parent })
  }

  return {
    directoryHandle,
    error,
    isRequesting,
    isRestoring,
    isSupported,
    lastAction,
    statusLabel,
    restoreFromCache,
    requestAccess,
    disconnect,
    listDir,
    readFile,
    writeFile,
    refreshDirectoryForPath,
    on: eventBus.on,
    off: eventBus.off
  }
}

let singleton

export function useRepoConnection() {
  if (!singleton) {
    singleton = createRepoConnection()
    if (typeof window !== 'undefined') {
      singleton.restoreFromCache()
    }
  }
  return singleton
}
