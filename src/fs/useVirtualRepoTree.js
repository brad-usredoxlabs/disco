import { reactive, ref, watch } from 'vue'
import { getParentPath, normalizePath } from './pathUtils'

function createNode(entry) {
  return reactive({
    path: entry.path,
    name: entry.name,
    kind: entry.kind,
    isExpanded: false,
    isLoading: false,
    isLoaded: entry.kind === 'file',
    children: entry.kind === 'directory' ? [] : null
  })
}

export function useVirtualRepoTree(repoConnection) {
  const rootNodes = ref([])
  const isBootstrapping = ref(false)
  const lastLoadedPath = ref('/')
  const directoryCache = new Map()

  function clearCache() {
    directoryCache.clear()
  }

  function cacheEntries(path, entries) {
    directoryCache.set(path, entries.map((entry) => ({ ...entry })))
  }

  function getCachedEntries(path) {
    const cached = directoryCache.get(path)
    if (!cached) return null
    return cached.map((entry) => ({ ...entry }))
  }

  function invalidateCache(path) {
    if (path === '/') {
      clearCache()
      return
    }
    directoryCache.delete(path)
  }

  async function buildChildren(path) {
    const normalized = normalizePath(path)
    const cachedEntries = getCachedEntries(normalized)
    if (cachedEntries) {
      return cachedEntries.map((entry) => createNode(entry))
    }

    try {
      const entries = await repoConnection.listDir(normalized)
      cacheEntries(normalized, entries)
      return entries.map((entry) => createNode(entry))
    } catch (err) {
      console.warn('Unable to read directory', normalized, err)
      return []
    }
  }

  async function bootstrap() {
    if (!repoConnection.directoryHandle.value) {
      rootNodes.value = []
      return
    }
    isBootstrapping.value = true
    rootNodes.value = await buildChildren('/')
    lastLoadedPath.value = '/'
    isBootstrapping.value = false
  }

  async function loadChildrenForNode(node) {
    if (!node || node.kind !== 'directory') return
    if (node.isLoading) return
    node.isLoading = true
    const children = await buildChildren(node.path)
    node.children = children
    node.isLoaded = true
    node.isExpanded = true
    node.isLoading = false
    lastLoadedPath.value = node.path
  }

  async function refreshDirectory(path) {
    const normalized = normalizePath(path)
    invalidateCache(normalized)
    if (normalized === '/') {
      await bootstrap()
      return
    }

    function findNode(nodes, targetPath) {
      for (const node of nodes) {
        if (node.path === targetPath) return node
        if (node.kind === 'directory' && node.children?.length) {
          const found = findNode(node.children, targetPath)
          if (found) return found
        }
      }
      return null
    }

    const parentNode = findNode(rootNodes.value, normalized)
    if (parentNode) {
      parentNode.isLoaded = false
      parentNode.children = []
      await loadChildrenForNode(parentNode)
    }
  }

  function reset() {
    rootNodes.value = []
    clearCache()
  }

  watch(
    () => repoConnection.directoryHandle.value,
    (handle) => {
      if (handle) {
        clearCache()
        bootstrap()
      } else {
        reset()
      }
    },
    { immediate: true }
  )

  const offWrite = repoConnection.on('fs:directoryNeedsRefresh', ({ path }) => {
    refreshDirectory(path)
  })

  const offConnect = repoConnection.on('repo:connected', () => {
    bootstrap()
  })

  const offDisconnect = repoConnection.on('repo:disconnected', () => reset())

  function dispose() {
    offWrite?.()
    offConnect?.()
    offDisconnect?.()
  }

  return {
    rootNodes,
    isBootstrapping,
    lastLoadedPath,
    bootstrap,
    loadChildrenForNode,
    refreshDirectory,
    reset,
    dispose
  }
}
