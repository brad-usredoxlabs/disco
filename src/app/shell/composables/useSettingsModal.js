import { ref, reactive, watch } from 'vue'

/**
 * Manages settings modal and configuration persistence
 * 
 * Handles:
 * - Settings modal visibility
 * - Form state synchronization with system config
 * - Saving settings to config/system.yaml
 * - Navigation to settings via URL
 */
export function useSettingsModal(systemConfig, isReady, isStandaloneSettings, clearSettingsTarget) {
  // State
  const showSettingsModal = ref(false)
  const settingsSaving = ref(false)
  const settingsError = ref('')
  const settingsForm = reactive({
    cacheDuration: 30,
    localNamespace: '',
    vendors: []
  })

  // Functions
  function openSettings() {
    settingsError.value = ''
    settingsSaving.value = false
    syncSettingsForm()
    
    // If in browser, navigate to settings standalone mode
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('settings', 'true')
      window.location.href = url.toString()
      return
    }
    
    showSettingsModal.value = true
  }

  function closeSettings() {
    if (isStandaloneSettings.value) {
      clearSettingsTarget()
    }
    showSettingsModal.value = false
  }

  async function saveSettings() {
    if (!isReady.value) {
      settingsError.value = 'Connect a repository to save settings.'
      return
    }
    
    settingsSaving.value = true
    settingsError.value = ''
    
    try {
      await systemConfig.save({
        ontology: {
          cache_duration: Number(settingsForm.cacheDuration) || 30
        },
        provenance: {
          local_namespace: settingsForm.localNamespace || ''
        },
        vendors: normalizeVendors(settingsForm.vendors)
      })
      
      if (isStandaloneSettings.value) {
        clearSettingsTarget()
      }
      showSettingsModal.value = false
    } catch (err) {
      settingsError.value = err?.message || 'Failed to save settings.'
    } finally {
      settingsSaving.value = false
    }
  }

  function syncSettingsForm() {
    const ontologyCfg = systemConfig.ontologyConfig.value
    settingsForm.cacheDuration = ontologyCfg.cacheDuration || 30
    settingsForm.localNamespace = systemConfig.provenanceConfig?.value?.localNamespace || ''
    settingsForm.vendors = normalizeVendors(systemConfig.vendorConfig?.value || [])
  }

  // Watchers
  watch(
    () => systemConfig.config.value,
    () => {
      syncSettingsForm()
    },
    { immediate: true }
  )

  return {
    // State
    showSettingsModal,
    settingsSaving,
    settingsError,
    settingsForm,
    normalizeVendors,

    // Functions
    openSettings,
    closeSettings,
    saveSettings,
    syncSettingsForm
  }
}

function normalizeVendors(list = []) {
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => {
      const name = (entry.name || '').trim()
      const slug = (entry.slug || '').trim()
      if (!name || !slug) return null
      return {
        name,
        slug,
        product_url_template: entry.product_url_template || '',
        homepage_url: entry.homepage_url || ''
      }
    })
    .filter(Boolean)
}
