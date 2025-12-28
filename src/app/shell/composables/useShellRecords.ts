import { useRecordGraph } from '../../graph/useRecordGraph'
import { useSearchIndex } from '../../search/useSearchIndex'
import { useRecordValidator } from '../../records/recordValidator'
import { useMaterialLibrary } from '../../plate-editor/composables/useMaterialLibrary'
import type { RecordServices } from '../types'

/**
 * Bundles record-centric services used across the shell (graph, search, validation, materials).
 */
export function useShellRecords(repo: unknown, schemaLoader: unknown): RecordServices {
  const recordGraph = useRecordGraph(repo, schemaLoader)
  const searchIndex = useSearchIndex(recordGraph)
  const recordValidator = useRecordValidator(schemaLoader)
  const materialLibrary = useMaterialLibrary(repo)

  return {
    recordGraph,
    searchIndex,
    recordValidator,
    materialLibrary
  }
}
