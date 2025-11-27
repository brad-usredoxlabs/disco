import { onMounted, onUnmounted, ref } from 'vue'

export function useOfflineStatus() {
  const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

  function updateStatus() {
    if (typeof navigator === 'undefined') return
    isOnline.value = navigator.onLine
  }

  onMounted(() => {
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)
  })

  onUnmounted(() => {
    window.removeEventListener('online', updateStatus)
    window.removeEventListener('offline', updateStatus)
  })

  return {
    isOnline
  }
}
