import { ref, watch } from 'vue'
import YAML from 'yaml'
import { createMachine } from 'xstate'

function deriveRecordType(filename) {
  return filename.replace(/\.machine\.yaml$/i, '')
}

export function useWorkflowBundle(repoConnection, schemaLoader) {
  const workflowBundle = ref(null)
  const status = ref('idle')
  const error = ref('')

  async function readYaml(path) {
    const text = await repoConnection.readFile(path)
    return YAML.parse(text)
  }

  async function loadBundle(bundleName) {
    status.value = 'loading'
    error.value = ''
    try {
      const manifestPath = `/workflow/${bundleName}/manifest.yaml`
      const manifest = await readYaml(manifestPath)
      const machines = {}

      for (const filename of manifest?.machines || []) {
        try {
          const config = await readYaml(`/workflow/${bundleName}/${filename}`)
          const recordType = deriveRecordType(filename)
          machines[recordType] = {
            machine: createMachine(config),
            config
          }
        } catch (err) {
          console.warn('[WorkflowBundle] Failed to load machine', filename, err)
        }
      }

      workflowBundle.value = {
        schemaSet: bundleName,
        manifest,
        machines
      }
      status.value = 'ready'
    } catch (err) {
      error.value = err?.message || 'Unable to load workflow manifest.'
      workflowBundle.value = null
      status.value = 'error'
    }
  }

  function reset() {
    workflowBundle.value = null
    status.value = 'idle'
    error.value = ''
  }

  function getMachine(recordType) {
    return workflowBundle.value?.machines?.[recordType] || null
  }

  watch(
    [() => repoConnection.directoryHandle.value, () => schemaLoader.selectedBundle.value],
    ([handle, bundleName]) => {
      if (handle && bundleName) {
        loadBundle(bundleName)
      } else {
        reset()
      }
    },
    { immediate: true }
  )

  return {
    workflowBundle,
    status,
    error,
    getMachine
  }
}
