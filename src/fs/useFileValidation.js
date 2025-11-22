import { ref } from 'vue'

function basicValidation(path, contents) {
  if (!contents || !contents.trim()) {
    throw new Error('File is empty — add content before saving.')
  }

  if (path.endsWith('.json')) {
    JSON.parse(contents)
  }

  if (path.endsWith('.yaml') || path.endsWith('.yml')) {
    // YAML support lands in later phases; treat as plain text for now.
    if (!/^---\n/m.test(contents)) {
      throw new Error('YAML files should start with front matter (---).')
    }
  }

  return true
}

export function useFileValidation(repoConnection) {
  const validationStatus = ref('idle')
  const validationMessage = ref('Waiting for a file to load.')
  const lastValidatedPath = ref('')

  async function runValidation(path, contents) {
    if (!path) return
    validationStatus.value = 'pending'
    validationMessage.value = 'Validating file contents…'
    lastValidatedPath.value = path

    try {
      await Promise.resolve(basicValidation(path, contents))
      validationStatus.value = 'ok'
      validationMessage.value = 'Validation passed (basic shell rules).'
    } catch (err) {
      validationStatus.value = 'error'
      validationMessage.value = err?.message || 'Validation failed.'
    }
  }

  const unsubscribe = repoConnection.on?.('fs:fileLoaded', ({ path, text }) => {
    if (typeof text === 'string') {
      runValidation(path, text)
    }
  })

  function dispose() {
    unsubscribe?.()
  }

  return {
    validationStatus,
    validationMessage,
    lastValidatedPath,
    runValidation,
    dispose
  }
}
