import { ref } from 'vue'

export function useRepoAccess() {
  const directoryHandle = ref(null)
  const error = ref('')
  const isRequesting = ref(false)

  const isSupported = typeof window !== 'undefined' && !!window.showDirectoryPicker

  async function requestAccess() {
    if (!isSupported) {
      error.value = 'File System Access API not available in this browser.'
      return null
    }

    try {
      isRequesting.value = true
      const handle = await window.showDirectoryPicker()
      directoryHandle.value = handle
      error.value = ''
      return handle
    } catch (err) {
      if (err?.name !== 'AbortError') {
        error.value = err?.message || 'Unable to access directory.'
      }
      return null
    } finally {
      isRequesting.value = false
    }
  }

  function reset() {
    directoryHandle.value = null
  }

  return {
    directoryHandle,
    error,
    isRequesting,
    isSupported,
    requestAccess,
    reset
  }
}