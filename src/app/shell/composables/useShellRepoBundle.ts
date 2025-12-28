import { computed } from 'vue'
import { useRepoConnection } from '../../fs/repoConnection'
import { useVirtualRepoTree } from '../../fs/useVirtualRepoTree'
import { useSchemaBundle } from '../../schema-bundles/useSchemaBundle'
import { useWorkflowBundle } from '../../workflows/useWorkflowBundle'
import { useSystemConfig } from '../../config/useSystemConfig'
import { useOfflineStatus } from '../../composables/useOfflineStatus'
import type { RepoBundleServices } from '../types'

/**
 * Composes repo connection, virtual tree, schema/workflow bundles, system config, and offline status.
 * Mirrors the existing AppShell bootstrap while keeping a narrow return shape.
 */
export function useShellRepoBundle(): RepoBundleServices & {
  connectionLabel: ReturnType<typeof computed>
  isReady: ReturnType<typeof computed>
  rootNodes: unknown
  isTreeBootstrapping: unknown
  schemaBundle: ReturnType<typeof computed>
  selectedBundleName: ReturnType<typeof computed>
} {
  const repo = useRepoConnection()
  const tree = useVirtualRepoTree(repo)
  const schemaLoader = useSchemaBundle(repo)
  const workflowLoader = useWorkflowBundle(repo, schemaLoader)
  const systemConfig = useSystemConfig(repo)
  const offlineStatus = useOfflineStatus()

  const connectionLabel = computed(() => repo.statusLabel.value)
  const isReady = computed(() => !!repo.directoryHandle.value)
  const rootNodes = tree.rootNodes
  const isTreeBootstrapping = tree.isBootstrapping
  const schemaBundle = computed(() => schemaLoader.schemaBundle?.value)
  const selectedBundleName = computed(() => schemaLoader.selectedBundle.value || '')

  return {
    repo,
    tree,
    schemaLoader,
    workflowLoader,
    systemConfig,
    offlineStatus,
    connectionLabel,
    isReady,
    rootNodes,
    isTreeBootstrapping,
    schemaBundle,
    selectedBundleName
  }
}
